import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Mutable scheduling metadata; calculation records remain authoritative for period progress. */
export const earningsSchedulesTable = defineTable({
  earningsId: v.id("deliverableEarnings"),
  status: v.union(v.literal("scheduled"), v.literal("needsAttention"), v.literal("complete")),
  // Absent while parked. Due-work reads must exclude undefined using gte("nextCheckAt", 0).
  nextCheckAt: v.optional(v.number()),
  // The scheduler's durable job state owns this claim; elapsed time alone cannot expire it.
  queuedWorker: v.optional(
    v.object({
      jobId: v.id("_scheduled_functions"),
      expectedNextCheckAt: v.number(),
    }),
  ),
  // One chronological scan spans bounded transactions; old rows start from period zero.
  scan: v.optional(
    v.object({
      nextPeriodIndex: v.number(),
      pendingMetrics: v.boolean(),
      cutoffAt: v.number(),
    }),
  ),
  lastAttemptedAt: v.optional(v.number()),
  // Diagnostic only: an attempted period can still have pending variable earnings.
  lastAttemptedPeriodIndex: v.optional(v.number()),
  retryCount: v.number(),
  // Operational metric retries never change pending calculation amounts or earning cutoffs.
  metricRetryCount: v.optional(v.number()),
  lastError: v.optional(v.string()),
})
  .index("by_earningsId", ["earningsId"])
  .index("by_nextCheckAt", ["nextCheckAt"]);
