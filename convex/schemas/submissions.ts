import { defineTable } from "convex/server";
import { v } from "convex/values";

export const submissionsTable = defineTable({
  campaignCreatorId: v.id("campaignCreators"),
  status: v.union(
    v.literal("draft"),
    v.literal("pending"),
    v.literal("accepted"),
    v.literal("rejected"),
    v.literal("needsRevision"),
  ),
  reviewNote: v.optional(v.string()),
  reviewedBy: v.optional(v.id("companyUsers")),
  reviewedAt: v.optional(v.number()),
}).index("by_creatorId", ["campaignCreatorId"]);
