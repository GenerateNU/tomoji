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
  // Denormalized from the campaign, which never changes owner, so company-wide
  // listing can use an index instead of joining through opportunities.
  companyId: v.id("companies"),
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
  .index("by_status", ["status"]);
