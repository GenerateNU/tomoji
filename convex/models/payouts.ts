import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { canViewResource, type ResourceViewer } from "../lib/authz";
import { apiError } from "../lib/errors";
import { withRowsReadCap } from "../lib/pagination";
import { requireNonBlank } from "../lib/validation";
import schema from "../schema";
import { hasOpenDispute } from "./disputes";

export const payoutCreate = schema
  .doc("payouts")
  .pick("assignmentId", "sourceKey", "amountCents", "currency", "postId", "earningPeriod");
export type PayoutCreate = Infer<typeof payoutCreate>;

const REVIEW_WINDOW_MS = 72 * 60 * 60 * 1000;

/**
 * Records a finalized earning and starts its company review window. The caller
 * calculates eligibility and the final amount; this does not execute a payment.
 * Identical retries return the existing payout without resetting its progress.
 * @throws `conflict` if a source key is reused with different earning details.
 */
export async function createPayout(ctx: MutationCtx, args: PayoutCreate): Promise<Doc<"payouts">> {
  const now = Date.now();
  const sourceKey = requireNonBlank(args.sourceKey, "sourceKey");
  const currency = args.currency.trim().toLowerCase();
  if (!Number.isSafeInteger(args.amountCents) || args.amountCents <= 0) {
    throw apiError("invalid_state", { reason: "amount_invalid" });
  }
  // Format only; the payment integration will define supported currencies.
  if (!/^[a-z]{3}$/.test(currency)) {
    throw apiError("invalid_state", { reason: "currency_invalid" });
  }
  const { earningPeriod } = args;
  if (
    earningPeriod !== undefined &&
    (!Number.isSafeInteger(earningPeriod.startsAt) ||
      !Number.isSafeInteger(earningPeriod.endsAt) ||
      earningPeriod.startsAt < 0 ||
      earningPeriod.endsAt <= earningPeriod.startsAt ||
      earningPeriod.endsAt > now)
  ) {
    throw apiError("invalid_state", { reason: "earning_period_invalid" });
  }

  // The indexed read and insert share a transaction. Concurrent retries cannot
  // both insert this key. Reconcile before live-parent checks to preserve retries
  // even if an assignment or post has since been removed.
  const existing = await ctx.db
    .query("payouts")
    .withIndex("by_assignmentId_and_sourceKey", (q) =>
      q.eq("assignmentId", args.assignmentId).eq("sourceKey", sourceKey),
    )
    .unique();
  if (existing !== null) {
    if (
      existing.amountCents !== args.amountCents ||
      existing.currency !== currency ||
      existing.postId !== args.postId ||
      existing.earningPeriod?.startsAt !== earningPeriod?.startsAt ||
      existing.earningPeriod?.endsAt !== earningPeriod?.endsAt
    ) {
      throw apiError("conflict", { reason: "payout_source_conflict" });
    }
    return existing;
  }

  const assignment = await ctx.db.get("assignments", args.assignmentId);
  if (assignment === null) throw apiError("not_found", { resource: "assignment" });
  if (args.postId !== undefined) {
    const post = await ctx.db.get("posts", args.postId);
    if (post === null) throw apiError("not_found", { resource: "post" });
    const submission = await ctx.db.get("submissions", post.submissionId);
    if (submission === null) throw apiError("not_found", { resource: "submission" });
    if (submission.assignmentId !== assignment._id) {
      throw apiError("invalid_state", { reason: "post_assignment_mismatch" });
    }
  }

  const payoutId = await ctx.db.insert("payouts", {
    assignmentId: assignment._id,
    sourceKey,
    amountCents: args.amountCents,
    currency,
    postId: args.postId,
    earningPeriod,
    creatorId: assignment.creatorId,
    companyId: assignment.companyId,
    campaignId: assignment.campaignId,
    reviewRequestedAt: now,
    approvalDueAt: now + REVIEW_WINDOW_MS,
    approvalStatus: "pending",
    paymentStatus: "notStarted",
  });
  return (await ctx.db.get("payouts", payoutId))!;
}

/** The same public view for every role; internal deduplication and actor IDs stay private. */
export const payoutView = schema
  .doc("payouts")
  .pick(
    "_id",
    "_creationTime",
    "assignmentId",
    "creatorId",
    "companyId",
    "campaignId",
    "postId",
    "earningPeriod",
    "amountCents",
    "currency",
    "reviewRequestedAt",
    "approvalDueAt",
    "approvalStatus",
    "approvedAt",
    "approvalSource",
    "paymentStatus",
    "transferredAt",
  );
export type PayoutView = Infer<typeof payoutView>;

/** Selects fields explicitly so future stored fields are private by default. */
function toPayoutView(payout: Doc<"payouts">): PayoutView {
  return {
    _id: payout._id,
    _creationTime: payout._creationTime,
    assignmentId: payout.assignmentId,
    creatorId: payout.creatorId,
    companyId: payout.companyId,
    campaignId: payout.campaignId,
    amountCents: payout.amountCents,
    currency: payout.currency,
    reviewRequestedAt: payout.reviewRequestedAt,
    approvalDueAt: payout.approvalDueAt,
    approvalStatus: payout.approvalStatus,
    paymentStatus: payout.paymentStatus,
    ...(payout.postId === undefined ? {} : { postId: payout.postId }),
    ...(payout.earningPeriod === undefined ? {} : { earningPeriod: payout.earningPeriod }),
    ...(payout.approvedAt === undefined ? {} : { approvedAt: payout.approvedAt }),
    ...(payout.approvalSource === undefined ? {} : { approvalSource: payout.approvalSource }),
    ...(payout.transferredAt === undefined ? {} : { transferredAt: payout.transferredAt }),
  };
}

/** Reads historical ownership from the payout without requiring its live parents. */
export async function requirePayout(
  ctx: QueryCtx,
  viewer: ResourceViewer,
  payoutId: Id<"payouts">,
): Promise<PayoutView> {
  const payout = await ctx.db.get("payouts", payoutId);
  if (payout === null || !canViewResource(viewer, payout)) {
    throw apiError("not_found", { resource: "payout" });
  }
  return toPayoutView(payout);
}

/** Approves an owned payout; the route supplies a verified company-admin membership. */
export async function approvePayout(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  payoutId: Id<"payouts">,
): Promise<PayoutView> {
  const payout = await ctx.db.get("payouts", payoutId);
  if (payout === null || payout.companyId !== membership.companyId) {
    throw apiError("not_found", { resource: "payout" });
  }
  if (payout.approvalStatus === "approved") return toPayoutView(payout);
  if (await hasOpenDispute(ctx, payout.assignmentId)) {
    throw apiError("invalid_state", { reason: "payout_disputed" });
  }
  const approval = {
    approvalStatus: "approved" as const,
    approvalSource: "company" as const,
    approvedBy: membership.userId,
    approvedAt: Date.now(),
  };
  await ctx.db.patch("payouts", payoutId, approval);
  return toPayoutView({ ...payout, ...approval });
}

export const payoutApprovalContinuation = v.object({ cursor: v.string(), cutoff: v.number() });
export type PayoutApprovalContinuation = Infer<typeof payoutApprovalContinuation>;

/**
 * Checks one page of due payouts. Held rows remain pending, so the cursor must
 * advance past them rather than repeatedly reading the first batch. A new cron
 * sweep revisits holds using their original deadline after disputes resolve.
 */
export async function autoApprovePayouts(
  ctx: MutationCtx,
  continuation?: PayoutApprovalContinuation,
): Promise<PayoutApprovalContinuation | null> {
  const now = Date.now();
  const cutoff = continuation?.cutoff ?? now;
  if (!Number.isSafeInteger(cutoff) || cutoff < 0 || cutoff > now) {
    throw apiError("invalid_state", { reason: "approval_cutoff_invalid" });
  }
  const result = await ctx.db
    .query("payouts")
    .withIndex("by_approvalStatus_and_approvalDueAt", (q) =>
      q.eq("approvalStatus", "pending").lte("approvalDueAt", cutoff),
    )
    .paginate({
      numItems: 50,
      maximumRowsRead: 50,
      cursor: continuation?.cursor ?? null,
    });
  for (const payout of result.page) {
    if (await hasOpenDispute(ctx, payout.assignmentId)) continue;
    await ctx.db.patch("payouts", payout._id, {
      approvalStatus: "approved",
      approvalSource: "automatic",
      approvedAt: now,
      approvedBy: undefined,
    });
  }
  return result.isDone ? null : { cursor: result.continueCursor, cutoff };
}

export const payoutListFilters = schema
  .doc("payouts")
  .pick("assignmentId", "campaignId", "approvalStatus")
  .partial()
  .extend({ paginationOpts: paginationOptsValidator });
export type PayoutListFilters = Infer<typeof payoutListFilters>;

/**
 * Lists the viewer's payouts newest review request first. Parent filters narrow
 * stored ownership, so foreign scopes return no rows and missing parents do not
 * hide history. Assignment and campaign filters may be combined.
 */
export async function listPayouts(
  ctx: QueryCtx,
  viewer: ResourceViewer,
  options: PayoutListFilters,
): Promise<PaginationResult<PayoutView>> {
  const { assignmentId, campaignId, paginationOpts } = options;
  let query = payoutsOf(ctx, viewer, options);
  const hasParentScope = assignmentId !== undefined || campaignId !== undefined;
  // Parent indexes bound the scan; ownership is still checked on every stored
  // payout instead of trusting the parent to exist or have its original owner.
  if (hasParentScope && viewer.role === "creator") {
    query = query.filter((q) => q.eq(q.field("creatorId"), viewer.creatorId));
  } else if (hasParentScope && viewer.role === "company") {
    query = query.filter((q) => q.eq(q.field("companyId"), viewer.companyId));
  }
  if (assignmentId !== undefined && campaignId !== undefined) {
    query = query.filter((q) => q.eq(q.field("campaignId"), campaignId));
  }
  const result = await query
    .order("desc")
    .paginate(hasParentScope ? withRowsReadCap(paginationOpts) : paginationOpts);
  return { ...result, page: result.page.map(toPayoutView) };
}

/** Paired indexes keep the same chronological ordering with or without a status filter. */
function payoutsOf(
  ctx: QueryCtx,
  viewer: ResourceViewer,
  { assignmentId, campaignId, approvalStatus }: PayoutListFilters,
) {
  const payouts = ctx.db.query("payouts");
  if (assignmentId !== undefined) {
    return approvalStatus === undefined
      ? payouts.withIndex("by_assignmentId_and_reviewRequestedAt", (q) =>
          q.eq("assignmentId", assignmentId),
        )
      : payouts.withIndex("by_assignmentId_and_approvalStatus_and_reviewRequestedAt", (q) =>
          q.eq("assignmentId", assignmentId).eq("approvalStatus", approvalStatus),
        );
  }
  if (campaignId !== undefined) {
    return approvalStatus === undefined
      ? payouts.withIndex("by_campaignId_and_reviewRequestedAt", (q) =>
          q.eq("campaignId", campaignId),
        )
      : payouts.withIndex("by_campaignId_and_approvalStatus_and_reviewRequestedAt", (q) =>
          q.eq("campaignId", campaignId).eq("approvalStatus", approvalStatus),
        );
  }
  switch (viewer.role) {
    case "creator":
      return approvalStatus === undefined
        ? payouts.withIndex("by_creatorId_and_reviewRequestedAt", (q) =>
            q.eq("creatorId", viewer.creatorId),
          )
        : payouts.withIndex("by_creatorId_and_approvalStatus_and_reviewRequestedAt", (q) =>
            q.eq("creatorId", viewer.creatorId).eq("approvalStatus", approvalStatus),
          );
    case "company":
      return approvalStatus === undefined
        ? payouts.withIndex("by_companyId_and_reviewRequestedAt", (q) =>
            q.eq("companyId", viewer.companyId),
          )
        : payouts.withIndex("by_companyId_and_approvalStatus_and_reviewRequestedAt", (q) =>
            q.eq("companyId", viewer.companyId).eq("approvalStatus", approvalStatus),
          );
    case "operator":
      return approvalStatus === undefined
        ? payouts.withIndex("by_reviewRequestedAt")
        : payouts.withIndex("by_approvalStatus_and_reviewRequestedAt", (q) =>
            q.eq("approvalStatus", approvalStatus),
          );
  }
}
