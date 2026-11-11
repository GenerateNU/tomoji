import { defineTable } from "convex/server";
import { v } from "convex/values";

export const earningsCutoffReason = v.union(v.literal("removed"), v.literal("cancelled"));
export const earningsVariableHoldReason = v.union(
  v.literal("verification_changed"),
  v.literal("post_replaced"),
  v.literal("metric_count_regressed"),
);

/** Immutable earnings agreement for one assigned deliverable, across post replacements. */
export const deliverableEarningsTable = defineTable({
  assignmentId: v.id("assignments"),
  deliverableId: v.id("deliverables"),
  postId: v.id("posts"),
  creatorId: v.id("creators"),
  companyId: v.id("companies"),
  campaignId: v.id("campaigns"),
  fixedFeeCents: v.number(),
  cpmRateCents: v.number(),
  paymentCapCents: v.number(),
  currency: v.literal("usd"),
  policyVersion: v.literal(1),
  startedAt: v.number(),
  endsAt: v.number(),
  cutoffAt: v.optional(v.number()),
  cutoffReason: v.optional(earningsCutoffReason),
  variableHoldReason: v.optional(earningsVariableHoldReason),
})
  .index("by_assignmentId_and_deliverableId", ["assignmentId", "deliverableId"])
  .index("by_assignmentId", ["assignmentId"]);
