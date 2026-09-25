import { defineTable } from "convex/server";
import { v } from "convex/values";

export const disputeStatus = v.union(v.literal("open"), v.literal("resolved"));

export const disputesTable = defineTable({
  assignmentId: v.id("assignments"),
  openedBy: v.id("users"),
  reason: v.string(),
  description: v.string(),
  status: disputeStatus,
  resolvedBy: v.optional(v.id("users")),
  resolution: v.optional(v.string()),
})
  .index("by_assignmentId_and_status", ["assignmentId", "status"])
  .index("by_openedBy", ["openedBy"])
  .index("by_resolvedBy", ["resolvedBy"]);
