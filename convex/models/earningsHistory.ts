import { v, type Infer } from "convex/values";
import { paginationOptsValidator, type PaginationResult } from "convex/server";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { canViewResource, type ResourceViewer } from "../lib/authz";
import { getEarningPeriod } from "../lib/earningsCalculator";
import { apiError } from "../lib/errors";
import schema from "../schema";

export const earningsLookup = schema
  .doc("deliverableEarnings")
  .pick("assignmentId", "deliverableId");
type EarningsLookup = Infer<typeof earningsLookup>;

export const earningsDetailView = schema
  .doc("deliverableEarnings")
  .pick(
    "_id",
    "assignmentId",
    "deliverableId",
    "postId",
    "creatorId",
    "companyId",
    "campaignId",
    "fixedFeeCents",
    "cpmRateCents",
    "paymentCapCents",
    "currency",
    "startedAt",
    "endsAt",
    "cutoffAt",
    "cutoffReason",
    "variableHoldReason",
  )
  .extend({
    window: v.union(
      v.object({ status: v.literal("known"), effectiveEndsAt: v.number() }),
      v.object({ status: v.literal("needsAttention") }),
    ),
    schedule: v.union(v.null(), schema.doc("earningsSchedules").pick("status", "nextCheckAt")),
  });
export type EarningsDetailView = Infer<typeof earningsDetailView>;

/** Stored ownership preserves historical access even after live parents disappear. */
async function requireVisibleEarnings(ctx: QueryCtx, viewer: ResourceViewer, args: EarningsLookup) {
  const earnings = await ctx.db
    .query("deliverableEarnings")
    .withIndex("by_assignmentId_and_deliverableId", (q) =>
      q.eq("assignmentId", args.assignmentId).eq("deliverableId", args.deliverableId),
    )
    .unique();
  if (earnings === null || !canViewResource(viewer, earnings)) {
    throw apiError("not_found", { resource: "deliverable_earnings" });
  }
  return earnings;
}

/** Projects stored timing only; queries must not infer state from the moving wall clock. */
function readWindow(
  earnings: Doc<"deliverableEarnings">,
  assignment: Doc<"assignments"> | null,
): EarningsDetailView["window"] {
  if (
    assignment === null ||
    assignment.creatorId !== earnings.creatorId ||
    assignment.companyId !== earnings.companyId ||
    assignment.campaignId !== earnings.campaignId ||
    (assignment.status === "cancelled" && assignment.cancelledAt === undefined)
  ) {
    return { status: "needsAttention" };
  }
  const cutoffs = [earnings.cutoffAt, assignment.cancelledAt];
  if (
    cutoffs.some(
      (time) => time !== undefined && (!Number.isSafeInteger(time) || time < earnings.startedAt),
    )
  ) {
    return { status: "needsAttention" };
  }
  const effectiveEndsAt = Math.min(earnings.endsAt, ...cutoffs.map((time) => time ?? Infinity));
  try {
    getEarningPeriod({
      startsAt: earnings.startedAt,
      windowEndsAt: earnings.endsAt,
      cutoffAt: effectiveEndsAt,
      periodIndex: 0,
    });
    return { status: "known", effectiveEndsAt };
  } catch {
    return { status: "needsAttention" };
  }
}

export async function requireEarningsDetails(
  ctx: QueryCtx,
  viewer: ResourceViewer,
  args: EarningsLookup,
): Promise<EarningsDetailView> {
  const earnings = await requireVisibleEarnings(ctx, viewer, args);
  const [assignment, schedule] = await Promise.all([
    ctx.db.get("assignments", earnings.assignmentId),
    ctx.db
      .query("earningsSchedules")
      .withIndex("by_earningsId", (q) => q.eq("earningsId", earnings._id))
      .unique(),
  ]);
  return {
    _id: earnings._id,
    assignmentId: earnings.assignmentId,
    deliverableId: earnings.deliverableId,
    postId: earnings.postId,
    creatorId: earnings.creatorId,
    companyId: earnings.companyId,
    campaignId: earnings.campaignId,
    fixedFeeCents: earnings.fixedFeeCents,
    cpmRateCents: earnings.cpmRateCents,
    paymentCapCents: earnings.paymentCapCents,
    currency: earnings.currency,
    startedAt: earnings.startedAt,
    endsAt: earnings.endsAt,
    ...(earnings.cutoffAt === undefined ? {} : { cutoffAt: earnings.cutoffAt }),
    ...(earnings.cutoffReason === undefined ? {} : { cutoffReason: earnings.cutoffReason }),
    ...(earnings.variableHoldReason === undefined
      ? {}
      : { variableHoldReason: earnings.variableHoldReason }),
    window: readWindow(earnings, assignment),
    schedule:
      schedule === null
        ? null
        : {
            status: schedule.status,
            ...(schedule.nextCheckAt === undefined ? {} : { nextCheckAt: schedule.nextCheckAt }),
          },
  };
}

export const earningsHistoryArgs = earningsLookup.extend({
  paginationOpts: paginationOptsValidator,
});
type EarningsHistoryArgs = Infer<typeof earningsHistoryArgs>;

/** Incremental amounts only. A calculation's cumulative totals are not another obligation. */
export const earningCalculationView = schema
  .doc("earningCalculations")
  .pick(
    "_id",
    "earningsId",
    "assignmentId",
    "deliverableId",
    "postId",
    "periodIndex",
    "periodStartsAt",
    "periodEndsAt",
    "isFinal",
    "component",
    "status",
    "currency",
    "cumulativeEligibleViews",
    "newFixedCents",
    "newVariableCents",
    "newPayoutCents",
    "capApplied",
    "calculatedAt",
    "completedAt",
    "payoutId",
    "coverageStartsAt",
    "coveredByCalculationId",
    "coveredAt",
  );
export type EarningCalculationView = Infer<typeof earningCalculationView>;

function toCalculationView(row: Doc<"earningCalculations">): EarningCalculationView {
  return {
    _id: row._id,
    earningsId: row.earningsId,
    assignmentId: row.assignmentId,
    deliverableId: row.deliverableId,
    postId: row.postId,
    periodIndex: row.periodIndex,
    periodStartsAt: row.periodStartsAt,
    periodEndsAt: row.periodEndsAt,
    isFinal: row.isFinal,
    component: row.component,
    status: row.status,
    currency: row.currency,
    calculatedAt: row.calculatedAt,
    ...(row.cumulativeEligibleViews === undefined
      ? {}
      : { cumulativeEligibleViews: row.cumulativeEligibleViews }),
    ...(row.completedAt === undefined ? {} : { completedAt: row.completedAt }),
    ...(row.coverageStartsAt === undefined ? {} : { coverageStartsAt: row.coverageStartsAt }),
    ...(row.coveredByCalculationId === undefined
      ? {}
      : { coveredByCalculationId: row.coveredByCalculationId }),
    ...(row.coveredAt === undefined ? {} : { coveredAt: row.coveredAt }),
    // Unresolved and covered rows carry no additional payable increment. Keep
    // unknown amounts absent; an explicit recorded zero remains a genuine zero.
    ...(row.status !== "recorded"
      ? {}
      : {
          ...(row.newFixedCents === undefined ? {} : { newFixedCents: row.newFixedCents }),
          ...(row.newVariableCents === undefined ? {} : { newVariableCents: row.newVariableCents }),
          ...(row.newPayoutCents === undefined ? {} : { newPayoutCents: row.newPayoutCents }),
          ...(row.payoutId === undefined ? {} : { payoutId: row.payoutId }),
          ...(row.capApplied === undefined ? {} : { capApplied: row.capApplied }),
        }),
  };
}

export async function listEarningCalculations(
  ctx: QueryCtx,
  viewer: ResourceViewer,
  args: EarningsHistoryArgs,
): Promise<PaginationResult<EarningCalculationView>> {
  const earnings = await requireVisibleEarnings(ctx, viewer, args);
  const result = await ctx.db
    .query("earningCalculations")
    .withIndex("by_earningsId_and_periodIndex", (q) => q.eq("earningsId", earnings._id))
    .order("desc")
    .paginate(args.paginationOpts);
  return { ...result, page: result.page.map(toCalculationView) };
}
