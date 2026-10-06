import { defineTable } from "convex/server";
import { v } from "convex/values";

export const assignmentStatus = v.union(
  v.literal("termsPending"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("cancelled"),
);

export const assignmentsTable = defineTable({
  opportunityId: v.id("opportunities"),
  creatorId: v.id("creators"),
  // Denormalized so company and campaign listing can use an index instead of
  // joining through opportunities. Neither can change: a campaign never changes
  // owner and an opportunity never moves campaigns.
  companyId: v.id("companies"),
  campaignId: v.id("campaigns"),
  // Agreed compensation is stored separately from editable opportunity defaults.
  // Amounts are integer cents; CPM is cents per 1,000 eligible views.
  fixedFeeCents: v.number(),
  cpmRateCents: v.number(),
  paymentCapCents: v.number(),
  usesAiReview: v.boolean(),
  status: assignmentStatus,
})
  .index("by_opportunityId_and_creatorId", ["opportunityId", "creatorId"])
  .index("by_opportunityId_and_status", ["opportunityId", "status"])
  .index("by_creatorId_and_status", ["creatorId", "status"])
  .index("by_companyId_and_status", ["companyId", "status"])
  // Export cursors must not move when an assignment's status changes.
  .index("by_campaignId", ["campaignId"])
  .index("by_campaignId_and_status", ["campaignId", "status"])
  .index("by_status", ["status"]);
