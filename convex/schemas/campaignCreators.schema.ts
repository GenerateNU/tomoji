import { defineTable } from "convex/server";
import { v } from "convex/values";

export const campaignCreatorsTable = defineTable({
  userId: v.id("users"),
  campaignId: v.id("campaigns"),
  stage: v.union(v.literal("pending"), v.literal("accepted"), v.literal("rejected")),
  note: v.optional(v.string()),
  selectedAt: v.optional(v.number()),
  acceptedAt: v.optional(v.number()),
})
  .index("by_userId", ["userId"])
  .index("by_campaignId", ["campaignId"])
  .index("by_campaignId_and_userId", ["campaignId", "userId"])
  .index("by_campaignId_and_stage", ["campaignId", "stage"]);
