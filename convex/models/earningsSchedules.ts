import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { getEarningPeriod } from "../lib/earningsCalculator";
import { apiError } from "../lib/errors";
import { MAX_DELIVERABLES } from "./deliverableDrafts";

type ScheduleTiming = { firstDueAt: number; cutoffAt: number } | { reason: string };

async function readScheduleTiming(
  ctx: MutationCtx,
  earnings: Doc<"deliverableEarnings">,
): Promise<ScheduleTiming> {
  const assignment = await ctx.db.get("assignments", earnings.assignmentId);
  if (assignment === null) return { reason: "assignment_missing" };
  if (assignment.status === "cancelled" && assignment.cancelledAt === undefined) {
    return { reason: "cancellation_time_missing" };
  }
  const now = Date.now();
  const observations = [earnings.startedAt, earnings.cutoffAt, assignment.cancelledAt];
  if (
    observations.some(
      (time) => time !== undefined && (!Number.isSafeInteger(time) || time < 0 || time > now),
    )
  ) {
    return { reason: "earning_timeline_invalid" };
  }
  if (
    [earnings.cutoffAt, assignment.cancelledAt].some(
      (time) => time !== undefined && time < earnings.startedAt,
    )
  ) {
    // Late cutoff evidence contradicts the stored verification. Existing fixed-fee
    // obligations may already exist, so reconcile instead of declaring zero owed.
    return { reason: "cutoff_precedes_verification" };
  }
  const cutoffAt = Math.min(
    earnings.endsAt,
    earnings.cutoffAt ?? Infinity,
    assignment.cancelledAt ?? Infinity,
  );
  try {
    const period = getEarningPeriod({
      startsAt: earnings.startedAt,
      windowEndsAt: earnings.endsAt,
      periodIndex: 0,
      cutoffAt,
    })!;
    return { firstDueAt: period.endsAt, cutoffAt };
  } catch {
    return { reason: "earning_timeline_invalid" };
  }
}

/** Initializes due work without interpreting calculation history or creating obligations. */
export async function ensureEarningsSchedule(
  ctx: MutationCtx,
  earningsId: Id<"deliverableEarnings">,
): Promise<Doc<"earningsSchedules">> {
  const existing = await ctx.db
    .query("earningsSchedules")
    .withIndex("by_earningsId", (q) => q.eq("earningsId", earningsId))
    .unique();
  if (existing !== null) return existing;
  const earnings = await ctx.db.get("deliverableEarnings", earningsId);
  if (earnings === null) throw apiError("not_found", { resource: "deliverable_earnings" });
  const timing = await readScheduleTiming(ctx, earnings);
  const id = await ctx.db.insert("earningsSchedules", {
    earningsId,
    ...("reason" in timing
      ? { status: "needsAttention" as const, lastError: timing.reason }
      : { status: "scheduled" as const, nextCheckAt: timing.firstDueAt }),
    retryCount: 0,
  });
  return (await ctx.db.get("earningsSchedules", id))!;
}

/** A shortened window must be rechecked even if earlier work was parked or complete. */
export async function bringForwardEarningsSchedule(
  ctx: MutationCtx,
  earningsId: Id<"deliverableEarnings">,
): Promise<Doc<"earningsSchedules">> {
  const schedule = await ensureEarningsSchedule(ctx, earningsId);
  const earnings = (await ctx.db.get("deliverableEarnings", earningsId))!;
  const timing = await readScheduleTiming(ctx, earnings);
  if ("reason" in timing) {
    await ctx.db.patch("earningsSchedules", schedule._id, {
      status: "needsAttention",
      nextCheckAt: undefined,
      lastError: timing.reason,
    });
  } else if (timing.cutoffAt < earnings.endsAt) {
    // Preserve earlier outstanding work and all attempt diagnostics. The worker must
    // reconsider recorded periods against this cutoff, not resume from a cursor.
    await ctx.db.patch("earningsSchedules", schedule._id, {
      status: "scheduled",
      nextCheckAt: Math.min(schedule.nextCheckAt ?? Infinity, timing.cutoffAt),
    });
  } else {
    return schedule;
  }
  return (await ctx.db.get("earningsSchedules", schedule._id))!;
}

/** Called in the cancellation transaction; never silently omit excess agreements. */
export async function bringForwardAssignmentEarningsSchedules(
  ctx: MutationCtx,
  assignmentId: Id<"assignments">,
): Promise<void> {
  const agreements = await ctx.db
    .query("deliverableEarnings")
    .withIndex("by_assignmentId_and_deliverableId", (q) => q.eq("assignmentId", assignmentId))
    .take(MAX_DELIVERABLES + 1);
  if (agreements.length > MAX_DELIVERABLES) {
    throw apiError("conflict", { reason: "earning_schedule_assignment_limit" });
  }
  for (const earnings of agreements) await bringForwardEarningsSchedule(ctx, earnings._id);
}
