import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Mutable scheduling metadata; calculation records remain authoritative for period progress. */
export const earningsSchedulesTable = defineTable({
  earningsId: v.id("deliverableEarnings"),
  status: v.union(v.literal("scheduled"), v.literal("needsAttention"), v.literal("complete")),
  // Absent while parked. Due-work reads must exclude undefined using gte("nextCheckAt", 0).
  nextCheckAt: v.optional(v.number()),
  lastAttemptedAt: v.optional(v.number()),
  // Diagnostic only: an attempted period can still have pending variable earnings.
  lastAttemptedPeriodIndex: v.optional(v.number()),
  retryCount: v.number(),
  lastError: v.optional(v.string()),
})
  .index("by_earningsId", ["earningsId"])
  .index("by_nextCheckAt", ["nextCheckAt"]);
