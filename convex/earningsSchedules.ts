import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  earningsScheduleRun,
  processEarningsSchedule,
  recordEarningsScheduleFailure,
  retryEarningsSchedule,
  type EarningsScheduleRun,
} from "./models/earningsScheduler";
import { earningsSweepContinuation, getDueEarningsSchedules } from "./models/earningsSchedules";
import schema from "./schema";

/** Discovers a bounded page of due agreements, retaining one cutoff across pages. */
export const sweep = internalMutation({
  args: { continuation: v.optional(earningsSweepContinuation) },
  returns: v.null(),
  handler: async (ctx, { continuation }): Promise<null> => {
    const due = await getDueEarningsSchedules(ctx, continuation);
    for (const schedule of due.page) {
      if (
        schedule.status === "scheduled" &&
        schedule.nextCheckAt !== undefined &&
        Number.isSafeInteger(schedule.nextCheckAt)
      ) {
        await ctx.scheduler.runAfter(0, internal.earningsSchedules.run, {
          scheduleId: schedule._id,
          expectedNextCheckAt: schedule.nextCheckAt,
        });
      }
    }
    if (due.continuation !== null) {
      await ctx.scheduler.runAfter(0, internal.earningsSchedules.sweep, {
        continuation: due.continuation,
      });
    }
    return null;
  },
});

/** Commits one period and its scan progress together; only the wrapper queues this work. */
export const process = internalMutation({
  args: earningsScheduleRun.fields,
  returns: v.union(earningsScheduleRun, v.null()),
  handler: async (ctx, args) => await processEarningsSchedule(ctx, args),
});

/** Isolates failures so partial settlement rolls back while retry metadata can still commit. */
export const run = internalMutation({
  args: earningsScheduleRun.fields,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    try {
      const continuation: EarningsScheduleRun | null = await ctx.runMutation(
        internal.earningsSchedules.process,
        args,
        {
          transactionLimits: {
            databaseQueries: 3_500,
            documentsRead: 8_000,
            bytesRead: 8_388_608,
            documentsWritten: 2_000,
          },
        },
      );
      if (continuation !== null) {
        await ctx.scheduler.runAfter(
          Math.max(0, continuation.expectedNextCheckAt - Date.now()),
          internal.earningsSchedules.run,
          continuation,
        );
      }
    } catch {
      await recordEarningsScheduleFailure(ctx, args);
    }
    return null;
  },
});

/** Requeues repaired data for the next sweep without changing the earning clock. */
export const retry = internalMutation({
  args: { scheduleId: v.id("earningsSchedules") },
  returns: schema.doc("earningsSchedules"),
  handler: async (ctx, { scheduleId }) => await retryEarningsSchedule(ctx, scheduleId),
});
