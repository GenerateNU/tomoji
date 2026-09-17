import { defineTable } from "convex/server";
import { v } from "convex/values";

export const postsTable = defineTable({
  submissionId: v.id("submissions"),
  campaignId: v.id("campaigns"),
  platform: v.union(v.literal("X")), // add more as more are supported
  status: v.union(v.literal("pending"), v.literal("posted"), v.literal("toRetry")),
  linkToPost: v.optional(v.string()),
}).index("by_campaignId_and_status", ["campaignId", "status"]);
