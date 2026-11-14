import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { v, type Infer } from "convex/values";
import { EARNING_WINDOW_MS } from "../lib/earningsCalculator";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";
import type { earningsVariableHoldReason } from "../schemas/deliverableEarnings.schema";

/** One durable agreement per assigned deliverable, independent of post replacement. */
export async function getDeliverableEarnings(
  ctx: QueryCtx | MutationCtx,
  assignmentId: Id<"assignments">,
  deliverableId: Id<"deliverables">,
): Promise<Doc<"deliverableEarnings"> | null> {
  return await ctx.db
    .query("deliverableEarnings")
    .withIndex("by_assignmentId_and_deliverableId", (q) =>
      q.eq("assignmentId", assignmentId).eq("deliverableId", deliverableId),
    )
    .unique();
}

async function requirePostContext(ctx: MutationCtx, postId: Id<"posts">) {
  const post = await ctx.db.get("posts", postId);
  const submission = post && (await ctx.db.get("submissions", post.submissionId));
  const assignment = submission && (await ctx.db.get("assignments", submission.assignmentId));
  if (!post || !submission || !assignment) {
    throw apiError("not_found", { resource: "post" });
  }
  return { post, submission, assignment };
}

/** Called in the verification transaction; no historical time is inferred from postedAt. */
export async function initializePostEarnings(
  ctx: MutationCtx,
  postId: Id<"posts">,
  verifiedAt: number,
): Promise<Doc<"deliverableEarnings"> | null> {
  const { post, submission, assignment } = await requirePostContext(ctx, postId);
  const existing = await getDeliverableEarnings(ctx, assignment._id, submission.deliverableId);
  if (existing !== null) {
    if (existing.postId !== postId && existing.variableHoldReason !== "post_replaced") {
      await ctx.db.patch("deliverableEarnings", existing._id, {
        variableHoldReason: "post_replaced",
      });
      return { ...existing, variableHoldReason: "post_replaced" };
    }
    return existing;
  }
  // Old unverified rows may have lost an earlier verification. Only tracked new
  // posts or a recorded original time can establish an agreement automatically.
  if (
    post.earningsTimingUnknown ||
    (post.firstVerifiedAt === undefined && post.earningsTrackingVersion === undefined)
  ) {
    if (!post.earningsTimingUnknown) {
      await ctx.db.patch("posts", postId, { earningsTimingUnknown: true });
    }
    return null;
  }
  const startedAt = post.firstVerifiedAt ?? verifiedAt;
  const endsAt = startedAt + EARNING_WINDOW_MS;
  if (
    !Number.isSafeInteger(startedAt) ||
    startedAt < 0 ||
    startedAt > Date.now() ||
    !Number.isSafeInteger(endsAt)
  ) {
    throw apiError("invalid_state", { reason: "earnings_time_invalid" });
  }
  const earningsId = await ctx.db.insert("deliverableEarnings", {
    assignmentId: assignment._id,
    deliverableId: submission.deliverableId,
    postId,
    creatorId: assignment.creatorId,
    companyId: assignment.companyId,
    campaignId: assignment.campaignId,
    fixedFeeCents: assignment.fixedFeeCents,
    cpmRateCents: assignment.cpmRateCents,
    paymentCapCents: assignment.paymentCapCents,
    currency: "usd",
    policyVersion: 1,
    startedAt,
    endsAt,
  });
  return (await ctx.db.get("deliverableEarnings", earningsId))!;
}

/** Stops automatic view attribution without changing the original earning agreement. */
export async function holdPostEarnings(
  ctx: MutationCtx,
  postId: Id<"posts">,
  reason: Infer<typeof earningsVariableHoldReason>,
): Promise<void> {
  const { post, submission, assignment } = await requirePostContext(ctx, postId);
  const earnings = await getDeliverableEarnings(ctx, assignment._id, submission.deliverableId);
  if (earnings !== null) {
    // A counter correction must not hide the stronger content-attribution problem.
    const variableHoldReason =
      earnings.variableHoldReason === "post_replaced" ||
      (earnings.variableHoldReason === "verification_changed" &&
        reason === "metric_count_regressed")
        ? earnings.variableHoldReason
        : reason;
    await ctx.db.patch("deliverableEarnings", earnings._id, { variableHoldReason });
  } else if (post.isVerified && post.firstVerifiedAt === undefined) {
    await ctx.db.patch("posts", postId, { earningsTimingUnknown: true });
  }
}

export const postViewObservation = v.object({
  postId: v.id("posts"),
  observedAt: v.number(),
  views: v.number(),
  sourceKey: v.string(),
});

/** Checks chronological neighbors so delayed evidence cannot hide a decrease and rebound. */
async function holdRegressingViewEvidence(
  ctx: MutationCtx,
  post: Doc<"posts">,
  observation: Infer<typeof postViewObservation>,
): Promise<void> {
  const submission = await ctx.db.get("submissions", post.submissionId);
  if (submission === null) return;
  const earnings = await getDeliverableEarnings(
    ctx,
    submission.assignmentId,
    submission.deliverableId,
  );
  if (
    earnings === null ||
    earnings.postId !== post._id ||
    earnings.variableHoldReason !== undefined
  )
    return;
  const assignment = await ctx.db.get("assignments", submission.assignmentId);
  const effectiveEnd = Math.min(
    earnings.endsAt,
    earnings.cutoffAt ?? Infinity,
    assignment?.cancelledAt ?? Infinity,
  );
  // Counts before the baseline or after accrual ends cannot create a view-earnings regression.
  if (observation.observedAt < earnings.startedAt || observation.observedAt > effectiveEnd) return;
  const [previous, next] = await Promise.all([
    ctx.db
      .query("postViewSnapshots")
      .withIndex("by_postId_and_observedAt", (q) =>
        q
          .eq("postId", post._id)
          .gte("observedAt", earnings.startedAt)
          .lt("observedAt", observation.observedAt),
      )
      .order("desc")
      .first(),
    ctx.db
      .query("postViewSnapshots")
      .withIndex("by_postId_and_observedAt", (q) =>
        q
          .eq("postId", post._id)
          .gt("observedAt", observation.observedAt)
          .lte("observedAt", effectiveEnd),
      )
      .first(),
  ]);
  if (
    (previous !== null && previous.views > observation.views) ||
    (next !== null && observation.views > next.views)
  ) {
    await ctx.db.patch("deliverableEarnings", earnings._id, {
      variableHoldReason: "metric_count_regressed",
    });
  }
}

// Bound the read work for one removal transaction. A longer eligible history keeps
// its hold for reconciliation; a partial scan must never authorize clearing it.
const MAX_REGRESSION_RECHECK_SNAPSHOTS = 1_000;

async function clearMetricRegressionHold(
  ctx: MutationCtx,
  earnings: Doc<"deliverableEarnings">,
  effectiveEnd: number,
): Promise<boolean> {
  if (earnings.variableHoldReason !== "metric_count_regressed" || effectiveEnd < earnings.startedAt)
    return false;
  const snapshots = await ctx.db
    .query("postViewSnapshots")
    .withIndex("by_postId_and_observedAt", (q) =>
      q
        .eq("postId", earnings.postId)
        .gte("observedAt", earnings.startedAt)
        .lte("observedAt", effectiveEnd),
    )
    .take(MAX_REGRESSION_RECHECK_SNAPSHOTS + 1);
  if (snapshots.length > MAX_REGRESSION_RECHECK_SNAPSHOTS) return false;
  for (const [index, snapshot] of snapshots.entries()) {
    if (
      !Number.isSafeInteger(snapshot.views) ||
      snapshot.views < 0 ||
      (index > 0 && snapshots[index - 1].views > snapshot.views)
    )
      return false;
  }
  await ctx.db.patch("deliverableEarnings", earnings._id, { variableHoldReason: undefined });
  return true;
}

/** Appends immutable evidence; replay cannot rewrite history or rewind the latest count. */
export async function recordPostViewSnapshot(
  ctx: MutationCtx,
  args: Infer<typeof postViewObservation>,
): Promise<Doc<"postViewSnapshots">> {
  const sourceKey = requireNonBlank(args.sourceKey, "sourceKey", 512);
  const existing = await ctx.db
    .query("postViewSnapshots")
    .withIndex("by_postId_and_sourceKey", (q) =>
      q.eq("postId", args.postId).eq("sourceKey", sourceKey),
    )
    .unique();
  if (existing !== null) {
    if (existing.observedAt !== args.observedAt || existing.views !== args.views) {
      throw apiError("conflict", { reason: "view_snapshot_conflict" });
    }
    return existing;
  }
  const now = Date.now();
  if (
    !Number.isSafeInteger(args.observedAt) ||
    args.observedAt < 0 ||
    args.observedAt > now ||
    !Number.isSafeInteger(args.views) ||
    args.views < 0
  ) {
    throw apiError("invalid_state", { reason: "view_snapshot_invalid" });
  }
  const atTime = await ctx.db
    .query("postViewSnapshots")
    .withIndex("by_postId_and_observedAt", (q) =>
      q.eq("postId", args.postId).eq("observedAt", args.observedAt),
    )
    .unique();
  if (atTime !== null) {
    // Reject aliases instead of accepting an unrecorded key that could be reused later.
    throw apiError("conflict", { reason: "view_snapshot_time_conflict" });
  }
  const post = await ctx.db.get("posts", args.postId);
  if (post === null) throw apiError("not_found", { resource: "post" });
  await holdRegressingViewEvidence(ctx, post, args);
  const snapshotId = await ctx.db.insert("postViewSnapshots", {
    ...args,
    sourceKey,
    receivedAt: now,
  });
  if (post.viewsUpdatedAt === undefined || args.observedAt >= post.viewsUpdatedAt) {
    await ctx.db.patch("posts", post._id, { views: args.views, viewsUpdatedAt: args.observedAt });
  }
  return (await ctx.db.get("postViewSnapshots", snapshotId))!;
}

export const postRemovalEvidence = v.object({
  postId: v.id("posts"),
  removedAt: v.number(),
  sourceKey: v.string(),
});

/** Records an established removal time, never inferred merely from a failed X request. */
export async function recordPostRemoval(
  ctx: MutationCtx,
  args: Infer<typeof postRemovalEvidence>,
): Promise<Doc<"posts">> {
  const { post, submission, assignment } = await requirePostContext(ctx, args.postId);
  const sourceKey = requireNonBlank(args.sourceKey, "sourceKey", 512);
  if (post.removedAt !== undefined) {
    if (post.removedAt !== args.removedAt || post.removalSourceKey !== sourceKey) {
      throw apiError("conflict", { reason: "post_removal_conflict" });
    }
  } else if (
    !Number.isSafeInteger(args.removedAt) ||
    args.removedAt < 0 ||
    args.removedAt > Date.now()
  ) {
    throw apiError("invalid_state", { reason: "post_removal_invalid" });
  }
  const patch = { removedAt: args.removedAt, removalSourceKey: sourceKey };
  if (post.removedAt === undefined) await ctx.db.patch("posts", args.postId, patch);
  const earnings = await getDeliverableEarnings(ctx, assignment._id, submission.deliverableId);
  if (earnings !== null && earnings.postId === args.postId) {
    if (earnings.cutoffAt === undefined || args.removedAt < earnings.cutoffAt) {
      await ctx.db.patch("deliverableEarnings", earnings._id, {
        cutoffAt: args.removedAt,
        cutoffReason: "removed",
      });
    }
    // A delayed removal can exclude the decline that originally caused the hold.
    // Recheck retries too, so a cutoff recorded before this check can be reconciled.
    await clearMetricRegressionHold(
      ctx,
      earnings,
      Math.min(
        earnings.endsAt,
        earnings.cutoffAt ?? Infinity,
        args.removedAt,
        assignment.cancelledAt ?? Infinity,
      ),
    );
  }
  return { ...post, ...patch };
}
