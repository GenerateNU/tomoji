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
  .index("by_creatorId_and_status", ["creatorId", "status"]);
