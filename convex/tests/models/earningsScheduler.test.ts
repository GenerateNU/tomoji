/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  processEarningsSchedule,
  recordEarningsScheduleFailure,
  retryEarningsSchedule,
} from "../../models/earningsScheduler";
import schema from "../../schema";
import { DAY, EARNINGS_TEST_START as START, seedScheduledEarnings } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

test("the first due run records earnings with a full review window and ignores duplicate work", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t);
  await fixture.snapshot(0, 50);
  vi.setSystemTime(START + 7 * DAY);
  await fixture.snapshot(7, 150);
  const args = { scheduleId: fixture.scheduleId, expectedNextCheckAt: START + 7 * DAY };
  vi.setSystemTime(START + 8 * DAY);
  await t.run((ctx) => processEarningsSchedule(ctx, args));
  const payouts = await t.run((ctx) => ctx.db.query("payouts").take(2));
  expect(payouts).toHaveLength(1);
  expect(payouts[0]).toMatchObject({
    amount: 11_000,
    approvalStatus: "pending",
    paymentStatus: "notStarted",
    reviewRequestedAt: START + 8 * DAY,
    approvalDueAt: START + 11 * DAY,
  });
  expect(await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId))).toMatchObject({
    status: "scheduled",
    nextCheckAt: START + 14 * DAY,
    lastAttemptedPeriodIndex: 0,
    retryCount: 0,
  });
  await t.run((ctx) => processEarningsSchedule(ctx, args));
  expect(await t.run((ctx) => ctx.db.query("payouts").take(2))).toEqual(payouts);
});

test("queued work cannot settle an earning period before it is due", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t, { cpmRateCents: 0 });
  const before = await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId));
  await t.run((ctx) =>
    processEarningsSchedule(ctx, {
      scheduleId: fixture.scheduleId,
      expectedNextCheckAt: START + 7 * DAY,
    }),
  );
  expect(await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId))).toEqual(before);
  expect(await t.run((ctx) => ctx.db.query("payouts").take(1))).toEqual([]);
});

test("execution failures back off, ignore stale workers, and eventually park for attention", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t);
  let due = START + 7 * DAY;
  for (let attempt = 1; attempt <= 5; attempt++) {
    vi.setSystemTime(due);
    const args = { scheduleId: fixture.scheduleId, expectedNextCheckAt: due };
    await t.run((ctx) => recordEarningsScheduleFailure(ctx, args));
    const schedule = (await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId)))!;
    expect(schedule).toMatchObject({
      retryCount: attempt,
      lastError: "settlement_execution_failed",
    });
    if (attempt < 5) {
      expect(schedule.nextCheckAt).toBe(due + 60_000 * 2 ** (attempt - 1));
      due = schedule.nextCheckAt!;
    } else {
      expect(schedule.status).toBe("needsAttention");
      expect(schedule.nextCheckAt).toBeUndefined();
    }
    await t.run((ctx) => recordEarningsScheduleFailure(ctx, args));
    expect(await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId))).toEqual(
      schedule,
    );
  }
  expect(await t.run((ctx) => ctx.db.query("payouts").take(1))).toEqual([]);
});

test("an internal retry requeues corrected work without resetting financial records", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t);
  await t.run((ctx) =>
    ctx.db.patch("earningsSchedules", fixture.scheduleId, {
      status: "needsAttention",
      nextCheckAt: undefined,
      retryCount: 5,
      lastError: "settlement_execution_failed",
      lastAttemptedAt: START,
      lastAttemptedPeriodIndex: 0,
    }),
  );
  vi.setSystemTime(START + 40 * DAY);
  const schedule = await t.run((ctx) => retryEarningsSchedule(ctx, fixture.scheduleId));
  expect(schedule).toMatchObject({
    status: "scheduled",
    nextCheckAt: Date.now(),
    retryCount: 0,
    lastAttemptedAt: START,
    lastAttemptedPeriodIndex: 0,
  });
  expect(await t.run((ctx) => ctx.db.query("payouts").take(1))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("earningCalculations").take(1))).toEqual([]);
});

test.each(["missing agreement", "invalid timeline"])(
  "parks %s instead of dropping due work",
  async (problem) => {
    const t = convexTest(schema, modules);
    const fixture = await seedScheduledEarnings(t);
    await t.run(async (ctx) => {
      if (problem === "missing agreement")
        await ctx.db.delete("deliverableEarnings", fixture.earningsId);
      else await ctx.db.patch("deliverableEarnings", fixture.earningsId, { endsAt: START });
    });
    vi.setSystemTime(START + 7 * DAY);
    await t.run((ctx) =>
      processEarningsSchedule(ctx, {
        scheduleId: fixture.scheduleId,
        expectedNextCheckAt: START + 7 * DAY,
      }),
    );
    const schedule = (await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId)))!;
    expect(schedule).toMatchObject({
      status: "needsAttention",
      lastError:
        problem === "missing agreement"
          ? "deliverable_earnings_missing"
          : "earning_timeline_invalid",
    });
    expect(schedule.nextCheckAt).toBeUndefined();
  },
);
