import { defineTable } from "convex/server";
import { v } from "convex/values";

export const disputesTable = defineTable({
  assignmentId: v.id("assignments"),
  openedBy: v.id("users"),
  reason: v.string(),
  description: v.string(),
  isResolved: v.boolean(),
  resolvedBy: v.optional(v.id("users")),
  resolution: v.optional(v.string()),
})
  .index("by_assignmentId_and_isResolved", ["assignmentId", "isResolved"])
  .index("by_openedBy", ["openedBy"])
  .index("by_resolvedBy", ["resolvedBy"]);
