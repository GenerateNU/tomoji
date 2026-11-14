import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { calculateEarnings, getEarningPeriod } from "../lib/earningsCalculator";
import { apiError } from "../lib/errors";
import { createPayout } from "./payouts";

export const earningSettlement = v.object({
  assignmentId: v.id("assignments"),
  deliverableId: v.id("deliverables"),
  periodIndex: v.number(),
});
export type EarningSettlement = Infer<typeof earningSettlement>;

export const earningSettlementResult = v.object({
  status: v.union(
    v.literal("recorded"),
    v.literal("pendingMetrics"),
    v.literal("needsAttention"),
    v.literal("notDue"),
    v.literal("outsideWindow"),
  ),
  reason: v.optional(v.string()),
  calculationIds: v.array(v.id("earningCalculations")),
  payoutIds: v.array(v.id("payouts")),
});
export type EarningSettlementResult = Infer<typeof earningSettlementResult>;

type Calculation = Doc<"earningCalculations">;
type Earnings = Doc<"deliverableEarnings">;
type Period = NonNullable<ReturnType<typeof getEarningPeriod>>;
type ReadyCalculation = Exclude<ReturnType<typeof calculateEarnings>, { status: "needsAttention" }>;
type Evidence = {
  baseline: Doc<"postViewSnapshots"> | null;
  cutoff: Doc<"postViewSnapshots"> | null;
};

// More than the five weekly settlements and their deferred components. Never
// use a partial sum when an imported/manual history exceeds this bounded read.
const MAX_OBLIGATIONS = 256;
const MAX_COMPONENTS = 3;

function emptyResult(
  status: EarningSettlementResult["status"],
  reason?: string,
): EarningSettlementResult {
  return { status, ...(reason === undefined ? {} : { reason }), calculationIds: [], payoutIds: [] };
}

function summarize(rows: Calculation[]): EarningSettlementResult {
  const ordered = [...rows].sort((a, b) => a.component.localeCompare(b.component));
  const attention = ordered.find((row) => row.status === "needsAttention");
  const pending = ordered.find((row) => row.status === "pendingMetrics");
  const unresolved = attention ?? pending;
  return {
    status: attention ? "needsAttention" : pending ? "pendingMetrics" : "recorded",
    ...(unresolved?.reason === undefined ? {} : { reason: unresolved.reason }),
    calculationIds: ordered.map((row) => row._id),
    payoutIds: ordered.flatMap((row) => (row.payoutId === undefined ? [] : [row.payoutId])),
  };
}

function isComplete(rows: Calculation[]): boolean {
  return rows.some(
    (row) =>
      (row.status === "recorded" || row.status === "covered") &&
      (row.component === "combined" || row.component === "variable"),
  );
}

async function periodCalculations(
  ctx: MutationCtx,
  earningsId: Id<"deliverableEarnings">,
  periodIndex: number,
) {
  const rows = await ctx.db
    .query("earningCalculations")
    .withIndex("by_earningsId_and_periodIndex", (q) =>
      q.eq("earningsId", earningsId).eq("periodIndex", periodIndex),
    )
    .take(MAX_COMPONENTS + 1);
  if (
    rows.length > MAX_COMPONENTS ||
    new Set(rows.map((row) => row.component)).size !== rows.length
  ) {
    throw apiError("conflict", { reason: "earning_calculation_duplicate" });
  }
  return rows;
}

/** Sum all obligation statuses, including legacy rows whose deliverable is inferred. */
async function recordedEarnings(ctx: MutationCtx, earnings: Earnings): Promise<number | string> {
  const linked = await ctx.db
    .query("payouts")
    .withIndex("by_assignmentId_and_deliverableId", (q) =>
      q.eq("assignmentId", earnings.assignmentId).eq("deliverableId", earnings.deliverableId),
    )
    .take(MAX_OBLIGATIONS + 1);
  const legacy = await ctx.db
    .query("payouts")
    .withIndex("by_assignmentId_and_deliverableId", (q) =>
      q.eq("assignmentId", earnings.assignmentId).eq("deliverableId", undefined),
    )
    .take(MAX_OBLIGATIONS + 1);
  if (linked.length > MAX_OBLIGATIONS || legacy.length > MAX_OBLIGATIONS)
    return "obligation_history_too_large";
  const relevant = [...linked];
  for (const payout of legacy) {
    const post = await ctx.db.get("posts", payout.postId);
    const submission = post === null ? null : await ctx.db.get("submissions", post.submissionId);
    if (submission === null || submission.assignmentId !== earnings.assignmentId) {
      return "legacy_obligation_unresolved";
    }
    if (submission.deliverableId === earnings.deliverableId) relevant.push(payout);
  }
  let total = BigInt(0);
  for (const payout of relevant) {
    if (payout.currency !== "usd" || !Number.isSafeInteger(payout.amount) || payout.amount <= 0) {
      return "obligation_invalid";
    }
    total += BigInt(payout.amount);
  }
  return total > BigInt(Number.MAX_SAFE_INTEGER) ? "obligation_total_unsafe" : Number(total);
}

async function snapshotAt(ctx: MutationCtx, postId: Id<"posts">, observedAt: number) {
  return await ctx.db
    .query("postViewSnapshots")
    .withIndex("by_postId_and_observedAt", (q) =>
      q.eq("postId", postId).eq("observedAt", observedAt),
    )
    .unique();
}

function earningSourceKey(
  earnings: Earnings,
  periodIndex: number,
  component: Calculation["component"],
) {
  return `earnings:${earnings._id}:period:${periodIndex}:${component}`;
}

type CalculationValues = {
  status: Calculation["status"];
  reason?: string;
  previouslyRecordedEarningsCents?: number;
  result?: ReadyCalculation;
  cumulativeEligibleViews?: number;
  coverageStartsAt?: number;
};

async function saveCalculation(
  ctx: MutationCtx,
  earnings: Earnings,
  periodIndex: number,
  period: Period,
  component: Calculation["component"],
  existing: Calculation | undefined,
  evidence: Evidence,
  values: CalculationValues,
): Promise<Calculation> {
  if (existing?.status === "recorded") return existing;
  const now = Date.now();
  const result = values.result;
  const sourceKey = earningSourceKey(earnings, periodIndex, component);
  const data = {
    earningsId: earnings._id,
    assignmentId: earnings.assignmentId,
    deliverableId: earnings.deliverableId,
    postId: earnings.postId,
    periodIndex,
    periodStartsAt: period.startsAt,
    periodEndsAt: period.endsAt,
    isFinal: period.isFinal,
    component,
    sourceKey,
    status: values.status,
    reason: values.reason,
    fixedFeeCents: earnings.fixedFeeCents,
    cpmRateCents: earnings.cpmRateCents,
    paymentCapCents: earnings.paymentCapCents,
    currency: earnings.currency,
    policyVersion: earnings.policyVersion,
    baselineSnapshotId: evidence.baseline?._id,
    cutoffSnapshotId: evidence.cutoff?._id,
    baselineViews: evidence.baseline?.views,
    cutoffViews: evidence.cutoff?.views,
    cumulativeEligibleViews: values.cumulativeEligibleViews,
    previouslyRecordedEarningsCents: values.previouslyRecordedEarningsCents,
    fixedEarnedCents: result?.fixedEarnedCents,
    variableEarnedCents: result?.variableEarnedCents ?? undefined,
    totalEarnedCents: result?.totalEarnedCents ?? undefined,
    newFixedCents: result?.newFixedCents,
    newVariableCents: result?.newVariableCents,
    newPayoutCents: result?.newPayoutCents,
    capApplied: result?.capApplied,
    calculatedAt: now,
    completedAt: values.status === "recorded" ? now : undefined,
    coverageStartsAt: values.coverageStartsAt,
  };
  const payout =
    values.status === "recorded" && result !== undefined && result.newPayoutCents > 0
      ? await createPayout(ctx, {
          assignmentId: earnings.assignmentId,
          postId: earnings.postId,
          sourceKey,
          amount: result.newPayoutCents,
          currency: earnings.currency,
          ...((values.coverageStartsAt ?? period.startsAt) === period.endsAt
            ? {}
            : {
                earningPeriod: {
                  startsAt: values.coverageStartsAt ?? period.startsAt,
                  endsAt: period.endsAt,
                },
              }),
        })
      : null;
  const record = { ...data, payoutId: payout?._id };
  const id =
    existing === undefined ? await ctx.db.insert("earningCalculations", record) : existing._id;
  if (existing !== undefined) await ctx.db.patch("earningCalculations", id, record);
  return (await ctx.db.get("earningCalculations", id))!;
}

/** One trusted period settlement. All evidence, accounting and payout writes share its transaction. */
export async function settleEarnings(
  ctx: MutationCtx,
  args: EarningSettlement,
): Promise<EarningSettlementResult> {
  if (!Number.isSafeInteger(args.periodIndex) || args.periodIndex < 0) {
    throw apiError("invalid_state", { reason: "earning_period_invalid" });
  }
  const earnings = await ctx.db
    .query("deliverableEarnings")
    .withIndex("by_assignmentId_and_deliverableId", (q) =>
      q.eq("assignmentId", args.assignmentId).eq("deliverableId", args.deliverableId),
    )
    .unique();
  if (earnings === null) throw apiError("not_found", { resource: "deliverable_earnings" });
  const assignment = await ctx.db.get("assignments", args.assignmentId);
  if (assignment === null) throw apiError("not_found", { resource: "assignment" });
  if (assignment.status === "cancelled" && assignment.cancelledAt === undefined) {
    return emptyResult("needsAttention", "cancellation_time_missing");
  }
  const cutoff = Math.min(
    earnings.endsAt,
    earnings.cutoffAt ?? Infinity,
    assignment.cancelledAt ?? Infinity,
  );
  let period: Period | null;
  try {
    period = getEarningPeriod({
      startsAt: earnings.startedAt,
      windowEndsAt: earnings.endsAt,
      periodIndex: args.periodIndex,
      cutoffAt: cutoff,
    });
  } catch {
    return emptyResult("needsAttention", "earning_timeline_invalid");
  }
  const existing = await periodCalculations(ctx, earnings._id, args.periodIndex);
  if (period === null) {
    return existing.length === 0
      ? emptyResult("outsideWindow")
      : { ...summarize(existing), status: "needsAttention", reason: "earning_period_changed" };
  }
  if (
    existing.some(
      (row) => row.periodStartsAt !== period.startsAt || row.periodEndsAt !== period.endsAt,
    )
  ) {
    return { ...summarize(existing), status: "needsAttention", reason: "earning_period_changed" };
  }
  if (isComplete(existing)) return summarize(existing);
  if (period.endsAt > Date.now()) return emptyResult("notDue");

  // Every earlier period must have been attempted. Missing measurement rows can
  // be explicitly covered by a later cumulative observation; other errors need
  // reconciliation instead of being hidden by a newer count.
  let previousCutoffViews: number | undefined;
  const pendingCoverage: Calculation[] = [];
  for (let index = 0; index < args.periodIndex; index++) {
    const previous = await periodCalculations(ctx, earnings._id, index);
    if (!isComplete(previous)) {
      const pending = previous.find(
        (row) =>
          row.component === "variable" &&
          row.status === "pendingMetrics" &&
          row.reason === "metric_evidence_missing",
      );
      if (pending === undefined || previous.some((row) => row.status === "needsAttention"))
        return emptyResult("needsAttention", "earlier_period_unsettled");
      pendingCoverage.push(pending);
    }
    previousCutoffViews =
      previous.find((row) => row.status === "recorded" && row.component !== "fixed")?.cutoffViews ??
      previousCutoffViews;
  }
  const prior = await recordedEarnings(ctx, earnings);
  const evidence = {
    baseline: await snapshotAt(ctx, earnings.postId, earnings.startedAt),
    cutoff: await snapshotAt(ctx, earnings.postId, period.endsAt),
  };
  const variable = existing.find((row) => row.component === "variable");
  const combined = existing.find((row) => row.component === "combined");
  if (typeof prior === "string") {
    const row = await saveCalculation(
      ctx,
      earnings,
      args.periodIndex,
      period,
      variable === undefined ? "combined" : "variable",
      variable ?? combined,
      evidence,
      { status: "needsAttention", reason: prior },
    );
    return summarize([...existing.filter((item) => item._id !== row._id), row]);
  }
  let hold = earnings.variableHoldReason;
  const post = await ctx.db.get("posts", earnings.postId);
  if (post === null) return emptyResult("needsAttention", "source_post_missing");
  if (!post.isActive || !post.isVerified) hold ??= "verification_changed";
  let reason: string | undefined = hold;
  let views: number | null = null;
  if (period.endsAt === earnings.startedAt) {
    views = 0;
  } else if (reason === undefined && evidence.baseline !== null && evidence.cutoff !== null) {
    if (
      evidence.cutoff.views < evidence.baseline.views ||
      (previousCutoffViews !== undefined && evidence.cutoff.views < previousCutoffViews)
    ) {
      reason = "metric_count_regressed";
    } else {
      views = evidence.cutoff.views - evidence.baseline.views;
    }
  }
  reason ??= views === null ? "metric_evidence_missing" : undefined;
  const result = calculateEarnings({
    ...earnings,
    previouslyRecordedEarningsCents: prior,
    cumulativeEligibleViews: views,
  });
  if (result.status === "needsAttention") {
    const row = await saveCalculation(
      ctx,
      earnings,
      args.periodIndex,
      period,
      variable === undefined ? "combined" : "variable",
      variable ?? combined,
      evidence,
      { status: "needsAttention", reason: result.reason, previouslyRecordedEarningsCents: prior },
    );
    return summarize([...existing.filter((item) => item._id !== row._id), row]);
  }
  const metricsCannotAffectAmount =
    earnings.cpmRateCents === 0 ||
    earnings.paymentCapCents === earnings.fixedFeeCents ||
    prior >= earnings.paymentCapCents;
  if (result.status === "ready" && (reason === undefined || metricsCannotAffectAmount)) {
    const component =
      variable !== undefined || existing.some((row) => row.component === "fixed")
        ? "variable"
        : "combined";
    const row = await saveCalculation(
      ctx,
      earnings,
      args.periodIndex,
      period,
      component,
      component === "variable" ? variable : combined,
      evidence,
      {
        status: "recorded",
        result,
        previouslyRecordedEarningsCents: prior,
        ...(views === null ? {} : { cumulativeEligibleViews: views }),
        ...(pendingCoverage.length === 0
          ? {}
          : {
              coverageStartsAt: Math.min(
                ...pendingCoverage.map((item) => item.periodStartsAt),
                period.startsAt,
              ),
            }),
      },
    );
    for (const covered of pendingCoverage) {
      await ctx.db.patch("earningCalculations", covered._id, {
        status: "covered",
        coveredByCalculationId: row._id,
        coveredAt: Date.now(),
      });
    }
    return summarize([...existing.filter((item) => item._id !== row._id), row]);
  }

  const rows = existing.filter((row) => row.component === "fixed");
  if (result.newFixedCents > 0) {
    rows.push(
      await saveCalculation(
        ctx,
        earnings,
        args.periodIndex,
        period,
        "fixed",
        rows[0],
        { baseline: null, cutoff: null },
        { status: "recorded", result, previouslyRecordedEarningsCents: prior },
      ),
    );
  }
  // If an earlier invalid calculation used combined, reuse that component for
  // the pending variable portion only when no payout has been finalized there.
  if (combined !== undefined) await ctx.db.delete("earningCalculations", combined._id);
  const pending = await saveCalculation(
    ctx,
    earnings,
    args.periodIndex,
    period,
    "variable",
    variable,
    evidence,
    {
      status: reason === "metric_evidence_missing" ? "pendingMetrics" : "needsAttention",
      reason,
      previouslyRecordedEarningsCents: prior + result.newFixedCents,
    },
  );
  rows.push(pending);
  return summarize(rows);
}
