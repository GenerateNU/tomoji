import { defineTable } from "convex/server";
import { v } from "convex/values";

export const earningCalculationComponent = v.union(
  v.literal("combined"),
  v.literal("fixed"),
  v.literal("variable"),
);
export const earningCalculationStatus = v.union(
  v.literal("pendingMetrics"),
  v.literal("needsAttention"),
  v.literal("recorded"),
  v.literal("covered"),
);

/** Evidence for one settlement component; only a linked payout is an obligation. */
export const earningCalculationsTable = defineTable({
  earningsId: v.id("deliverableEarnings"),
  assignmentId: v.id("assignments"),
  deliverableId: v.id("deliverables"),
  postId: v.id("posts"),
  periodIndex: v.number(),
  periodStartsAt: v.number(),
  periodEndsAt: v.number(),
  isFinal: v.boolean(),
  component: earningCalculationComponent,
  sourceKey: v.string(),
  status: earningCalculationStatus,
  reason: v.optional(v.string()),
  fixedFeeCents: v.number(),
  cpmRateCents: v.number(),
  paymentCapCents: v.number(),
  currency: v.literal("usd"),
  policyVersion: v.literal(1),
  baselineSnapshotId: v.optional(v.id("postViewSnapshots")),
  cutoffSnapshotId: v.optional(v.id("postViewSnapshots")),
  baselineViews: v.optional(v.number()),
  cutoffViews: v.optional(v.number()),
  cumulativeEligibleViews: v.optional(v.number()),
  previouslyRecordedEarningsCents: v.optional(v.number()),
  fixedEarnedCents: v.optional(v.number()),
  variableEarnedCents: v.optional(v.number()),
  totalEarnedCents: v.optional(v.number()),
  newFixedCents: v.optional(v.number()),
  newVariableCents: v.optional(v.number()),
  newPayoutCents: v.optional(v.number()),
  capApplied: v.optional(v.boolean()),
  payoutId: v.optional(v.id("payouts")),
  calculatedAt: v.number(),
  completedAt: v.optional(v.number()),
  // A later cumulative measurement may cover a missing earlier boundary.
  coverageStartsAt: v.optional(v.number()),
  coveredByCalculationId: v.optional(v.id("earningCalculations")),
  coveredAt: v.optional(v.number()),
})
  .index("by_earningsId_and_periodIndex", ["earningsId", "periodIndex"])
  .index("by_earningsId_and_periodIndex_and_component", ["earningsId", "periodIndex", "component"])
  .index("by_assignmentId_and_deliverableId", ["assignmentId", "deliverableId"]);
