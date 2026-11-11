import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  earningsScheduleRun,
  processEarningsSchedule,
  recordEarningsScheduleFailure,
  retryEarningsSchedule,
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

/** Commits settlement and scheduling progress together; only the wrapper queues this work. */
export const process = internalMutation({
  args: earningsScheduleRun.fields,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await processEarningsSchedule(ctx, args);
    return null;
  },
});

/** Isolates failures so partial settlement rolls back while retry metadata can still commit. */
export const run = internalMutation({
  args: earningsScheduleRun.fields,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    try {
      await ctx.runMutation(internal.earningsSchedules.process, args, {
        transactionLimits: {
          documentsRead: 8_000,
          bytesRead: 8_388_608,
          documentsWritten: 2_000,
        },
      });
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
