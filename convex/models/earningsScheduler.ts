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
    lastAttemptedAt: Date.now(),
    lastError: reason,
    ...(periodIndex === undefined ? {} : { lastAttemptedPeriodIndex: periodIndex }),
  });
}

/** Settlement and scheduling progress are committed in the same transaction. */
export async function processEarningsSchedule(
  ctx: MutationCtx,
  args: EarningsScheduleRun,
): Promise<void> {
  const schedule = await runnableSchedule(ctx, args);
  if (schedule === null) return;
  const earnings = await ctx.db.get("deliverableEarnings", schedule.earningsId);
  if (earnings === null)
    return await parkSchedule(ctx, schedule._id, "deliverable_earnings_missing");
  const timing = await getEarningsScheduleTiming(ctx, earnings);
  if ("reason" in timing) return await parkSchedule(ctx, schedule._id, timing.reason);
  const periodCount = Math.ceil((earnings.endsAt - earnings.startedAt) / EARNING_PERIOD_MS);
  if (periodCount > MAX_PERIODS)
    return await parkSchedule(ctx, schedule._id, "earning_window_too_large");
  const now = Date.now();
  let pendingMetrics = false;
  let nextBoundary: number | undefined;
  let lastAttemptedPeriodIndex: number | undefined;
  for (let periodIndex = 0; periodIndex < periodCount; periodIndex++) {
    const period = getEarningPeriod({
      startsAt: earnings.startedAt,
      windowEndsAt: earnings.endsAt,
      cutoffAt: timing.cutoffAt,
      periodIndex,
    });
    if (period !== null && period.endsAt > now) {
      nextBoundary = period.endsAt;
      break;
    }
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
  }
  const nextCheckAt = pendingMetrics
    ? Math.min(now + METRIC_RETRY_MS, nextBoundary ?? Infinity)
    : nextBoundary;
  await ctx.db.patch("earningsSchedules", schedule._id, {
    status: nextCheckAt === undefined ? "complete" : "scheduled",
    nextCheckAt,
    lastAttemptedAt: now,
    ...(lastAttemptedPeriodIndex === undefined ? {} : { lastAttemptedPeriodIndex }),
    retryCount: 0,
    lastError: pendingMetrics ? "metric_evidence_missing" : undefined,
  });
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
    retryCount: 0,
  });
  return (await ctx.db.get("earningsSchedules", scheduleId))!;
}
