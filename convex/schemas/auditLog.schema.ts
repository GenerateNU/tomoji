import { defineTable } from "convex/server";
import { v } from "convex/values";

export const auditLogTable = defineTable({
  userId: v.id("users"),
  action: v.string(), // the route that ran
  targetTable: v.string(),
  targetId: v.string(),
  viaApiKey: v.optional(v.string()), // Set when an agent acted on the user's behalf
  metadata: v.optional(v.record(v.string(), v.any())),
})
  .index("by_userId", ["userId"])
  .index("by_target", ["targetTable", "targetId"]);
