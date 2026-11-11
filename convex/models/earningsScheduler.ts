import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { EARNING_PERIOD_MS, getEarningPeriod } from "../lib/earningsCalculator";
import { apiError } from "../lib/errors";
import { settleEarnings } from "./earnings";
import { getEarningsScheduleTiming } from "./earningsSchedules";

export const earningsScheduleRun = v.object({
  scheduleId: v.id("earningsSchedules"),
  expectedNextCheckAt: v.number(),
});
export type EarningsScheduleRun = Infer<typeof earningsScheduleRun>;

const METRIC_RETRY_MS = 60 * 60_000;
const EXECUTION_RETRY_MS = 60_000;
const MAX_EXECUTION_ATTEMPTS = 5;
// The default window has five periods. Bound work even for malformed/imported windows.
const MAX_PERIODS = 64;

/** Rechecks queued work against current scheduling state before making any writes. */
async function runnableSchedule(ctx: MutationCtx, args: EarningsScheduleRun) {
  const schedule = await ctx.db.get("earningsSchedules", args.scheduleId);
  return schedule !== null &&
    schedule.status === "scheduled" &&
    schedule.nextCheckAt !== undefined &&
    schedule.nextCheckAt === args.expectedNextCheckAt &&
    schedule.nextCheckAt <= Date.now()
    ? schedule
    : null;
}

async function parkSchedule(
  ctx: MutationCtx,
  scheduleId: Id<"earningsSchedules">,
  reason: string,
  periodIndex?: number,
) {
  await ctx.db.patch("earningsSchedules", scheduleId, {
    status: "needsAttention",
    nextCheckAt: undefined,
    scan: undefined,
    lastAttemptedAt: Date.now(),
    lastError: reason,
    ...(periodIndex === undefined ? {} : { lastAttemptedPeriodIndex: periodIndex }),
  });
  return null;
}

/** Settles at most one period and commits its scan progress in the same transaction. */
export async function processEarningsSchedule(
  ctx: MutationCtx,
  args: EarningsScheduleRun,
): Promise<EarningsScheduleRun | null> {
  const schedule = await runnableSchedule(ctx, args);
  if (schedule === null) return null;
  const earnings = await ctx.db.get("deliverableEarnings", schedule.earningsId);
  if (earnings === null)
    return await parkSchedule(ctx, schedule._id, "deliverable_earnings_missing");
  const timing = await getEarningsScheduleTiming(ctx, earnings);
  if ("reason" in timing) return await parkSchedule(ctx, schedule._id, timing.reason);
  const periodCount = Math.ceil((earnings.endsAt - earnings.startedAt) / EARNING_PERIOD_MS);
  if (periodCount > MAX_PERIODS)
    return await parkSchedule(ctx, schedule._id, "earning_window_too_large");
  const now = Date.now();
  // Cutoffs can change between transactions. Never skip older calculations when
  // validating a new window, including changes made through internal recovery.
  const scan = schedule.scan?.cutoffAt === timing.cutoffAt ? schedule.scan : undefined;
  const periodIndex = scan?.nextPeriodIndex ?? 0;
  if (!Number.isSafeInteger(periodIndex) || periodIndex < 0 || periodIndex >= periodCount)
    return await parkSchedule(ctx, schedule._id, "earning_scan_invalid");
  let pendingMetrics = scan?.pendingMetrics ?? false;
  let nextBoundary: number | undefined;
  let lastAttemptedPeriodIndex: number | undefined;
  const period = getEarningPeriod({
    startsAt: earnings.startedAt,
    windowEndsAt: earnings.endsAt,
    cutoffAt: timing.cutoffAt,
    periodIndex,
  });
  if (period !== null && period.endsAt > now) {
    nextBoundary = period.endsAt;
  } else {
    // Even periods outside a shortened window must be checked: a retrospective
    // cutoff can invalidate a later recorded period that requires reconciliation.
    const result = await settleEarnings(ctx, {
      assignmentId: earnings.assignmentId,
      deliverableId: earnings.deliverableId,
      periodIndex,
    });
    lastAttemptedPeriodIndex = periodIndex;
    if (result.status === "needsAttention") {
      return await parkSchedule(
        ctx,
        schedule._id,
        result.reason ?? "earning_reconciliation_required",
        periodIndex,
      );
    }
    if (result.status === "notDue") {
      throw apiError("conflict", { reason: "earning_schedule_timing_changed" });
    }
    if (result.status === "pendingMetrics") pendingMetrics = true;
    // A later successful settlement covers earlier pending metric periods atomically.
    if (result.status === "recorded") pendingMetrics = false;

    if (periodIndex + 1 < periodCount) {
      const nextPeriod = getEarningPeriod({
        startsAt: earnings.startedAt,
        windowEndsAt: earnings.endsAt,
        cutoffAt: timing.cutoffAt,
        periodIndex: periodIndex + 1,
      });
      if (nextPeriod !== null && nextPeriod.endsAt > now) {
        nextBoundary = nextPeriod.endsAt;
      } else {
        // A new due token makes queued duplicates stale, even within the same ms.
        // The route queues this continuation in a fresh transaction with fresh limits.
        const nextCheckAt = now + 1;
        await ctx.db.patch("earningsSchedules", schedule._id, {
          status: "scheduled",
          nextCheckAt,
          scan: { nextPeriodIndex: periodIndex + 1, pendingMetrics, cutoffAt: timing.cutoffAt },
          lastAttemptedAt: now,
          lastAttemptedPeriodIndex: periodIndex,
          retryCount: 0,
          lastError: pendingMetrics ? "metric_evidence_missing" : undefined,
        });
        return { scheduleId: schedule._id, expectedNextCheckAt: nextCheckAt };
      }
    }
  }
  const nextCheckAt = pendingMetrics
    ? Math.min(now + METRIC_RETRY_MS, nextBoundary ?? Infinity)
    : nextBoundary;
  await ctx.db.patch("earningsSchedules", schedule._id, {
    status: nextCheckAt === undefined ? "complete" : "scheduled",
    nextCheckAt,
    scan: undefined,
    lastAttemptedAt: now,
    ...(lastAttemptedPeriodIndex === undefined ? {} : { lastAttemptedPeriodIndex }),
    retryCount: 0,
    lastError: pendingMetrics ? "metric_evidence_missing" : undefined,
  });
  return null;
}

/** The processing subtransaction has rolled back; store only a safe error code and backoff. */
export async function recordEarningsScheduleFailure(
  ctx: MutationCtx,
  args: EarningsScheduleRun,
): Promise<void> {
  const schedule = await runnableSchedule(ctx, args);
  if (schedule === null) return;
  const retryCount = Math.min(schedule.retryCount + 1, MAX_EXECUTION_ATTEMPTS);
  const exhausted = retryCount === MAX_EXECUTION_ATTEMPTS;
  await ctx.db.patch("earningsSchedules", schedule._id, {
    status: exhausted ? "needsAttention" : "scheduled",
    nextCheckAt: exhausted ? undefined : Date.now() + EXECUTION_RETRY_MS * 2 ** (retryCount - 1),
    retryCount,
    lastAttemptedAt: Date.now(),
    lastError: "settlement_execution_failed",
  });
}

/** Trusted recovery after correction. Existing obligations and attempt history remain intact. */
export async function retryEarningsSchedule(ctx: MutationCtx, scheduleId: Id<"earningsSchedules">) {
  const schedule = await ctx.db.get("earningsSchedules", scheduleId);
  if (schedule === null) throw apiError("not_found", { resource: "earnings_schedule" });
  await ctx.db.patch("earningsSchedules", scheduleId, {
    status: "scheduled",
    nextCheckAt: Date.now(),
    scan: undefined,
    retryCount: 0,
  });
  return (await ctx.db.get("earningsSchedules", scheduleId))!;
}
