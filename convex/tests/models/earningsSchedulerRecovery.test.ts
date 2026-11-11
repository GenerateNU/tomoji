/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { processEarningsSchedule } from "../../models/earningsScheduler";
import { cancelAssignment } from "../../models/assignments";
import { recordPostRemoval } from "../../models/earningSources";
import schema from "../../schema";
import {
  DAY,
  EARNINGS_TEST_START as START,
  seedScheduledEarnings,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
type Fixture = Awaited<ReturnType<typeof seedScheduledEarnings>>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

async function run(t: TestConvex, fixture: Fixture) {
  const schedule = (await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId)))!;
  if (schedule.nextCheckAt === undefined) throw new Error("expected scheduled work");
  await t.run((ctx) =>
    processEarningsSchedule(ctx, {
      scheduleId: fixture.scheduleId,
      expectedNextCheckAt: schedule.nextCheckAt!,
    }),
  );
  return (await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId)))!;
}

test("downtime catches up all five periods with review deadlines based on actual creation", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t);
  vi.setSystemTime(START + 40 * DAY);
  for (const [day, views] of [
    [0, 50],
    [7, 150],
    [14, 350],
    [21, 650],
    [28, 950],
    [30, 1250],
  ]) {
    await fixture.snapshot(day, views);
  }
  const schedule = await run(t, fixture);
  const payouts = await t.run((ctx) => ctx.db.query("payouts").take(6));
  payouts.sort((a, b) => a.earningPeriod!.endsAt - b.earningPeriod!.endsAt);
  expect(payouts.map((row) => row.amount)).toEqual([11_000, 2_000, 3_000, 3_000, 1_000]);
  expect(payouts.every((row) => row.approvalStatus === "pending")).toBe(true);
  expect(payouts.every((row) => row.approvalDueAt === START + 43 * DAY)).toBe(true);
  expect(schedule.status).toBe("complete");
  expect(schedule.nextCheckAt).toBeUndefined();
});

test("a later boundary covers missing metrics without repeating the fixed fee or retaining a stale retry", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t);
  await fixture.snapshot(0, 0);
  vi.setSystemTime(START + 7 * DAY);
  const pending = await run(t, fixture);
  expect(pending).toMatchObject({ status: "scheduled", lastError: "metric_evidence_missing" });
  expect((await t.run((ctx) => ctx.db.query("payouts").take(3))).map((row) => row.amount)).toEqual([
    10_000,
  ]);

  vi.setSystemTime(START + 14 * DAY);
  await fixture.snapshot(14, 300);
  const next = await run(t, fixture);
  expect(next).toMatchObject({ status: "scheduled", nextCheckAt: START + 21 * DAY, retryCount: 0 });
  expect(next.lastError).toBeUndefined();
  expect((await t.run((ctx) => ctx.db.query("payouts").take(3))).map((row) => row.amount)).toEqual([
    10_000, 3_000,
  ]);
  const calculations = await t.run((ctx) => ctx.db.query("earningCalculations").take(5));
  expect(
    calculations.find((row) => row.periodIndex === 0 && row.component === "variable"),
  ).toMatchObject({ status: "covered" });
});

test("missing final metrics remain recoverable after day thirty", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t);
  await fixture.snapshot(0, 0);
  vi.setSystemTime(START + 30 * DAY);
  const pending = await run(t, fixture);
  expect(pending.status).toBe("scheduled");
  expect(pending.nextCheckAt).toBeGreaterThan(START + 30 * DAY);

  vi.setSystemTime(START + 35 * DAY);
  await fixture.snapshot(30, 100);
  const complete = await run(t, fixture);
  expect(complete.status).toBe("complete");
  expect(complete.nextCheckAt).toBeUndefined();
  expect(complete.lastError).toBeUndefined();
  expect((await t.run((ctx) => ctx.db.query("payouts").take(3))).map((row) => row.amount)).toEqual([
    10_000, 1_000,
  ]);
});

test("cancellation settles the accrued partial period even when the earlier payout is unpaid", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t);
  await fixture.snapshot(0, 0);
  vi.setSystemTime(START + 7 * DAY);
  await fixture.snapshot(7, 100);
  await run(t, fixture);
  vi.setSystemTime(START + 10 * DAY);
  await fixture.snapshot(10, 300);
  await t.run(async (ctx) =>
    cancelAssignment(ctx, (await ctx.db.get("assignments", fixture.assignmentId))!),
  );

  expect((await run(t, fixture)).status).toBe("complete");
  const payouts = await t.run((ctx) => ctx.db.query("payouts").take(3));
  expect(payouts.map((row) => row.amount)).toEqual([11_000, 2_000]);
  expect(payouts.every((row) => row.paymentStatus === "notStarted")).toBe(true);
  expect(payouts[1].earningPeriod).toEqual({ startsAt: START + 7 * DAY, endsAt: START + 10 * DAY });
});

test("removal before the first week includes the fixed fee in its final settlement", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t);
  await fixture.snapshot(0, 0);
  vi.setSystemTime(START + 3 * DAY);
  await fixture.snapshot(3, 100);
  await t.run((ctx) =>
    recordPostRemoval(ctx, {
      postId: fixture.postId,
      removedAt: Date.now(),
      sourceKey: "removed:3",
    }),
  );

  expect((await run(t, fixture)).status).toBe("complete");
  expect(await t.run((ctx) => ctx.db.query("payouts").take(2))).toMatchObject([
    { amount: 11_000, approvalDueAt: START + 6 * DAY },
  ]);
});

test("a retrospective boundary cutoff detects recorded earnings beyond the new final period", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t);
  await fixture.snapshot(0, 0);
  vi.setSystemTime(START + 14 * DAY);
  await fixture.snapshot(7, 100);
  await fixture.snapshot(14, 300);
  await run(t, fixture);
  const before = await t.run((ctx) => ctx.db.query("payouts").take(3));
  await t.run((ctx) =>
    recordPostRemoval(ctx, {
      postId: fixture.postId,
      removedAt: START + 7 * DAY,
      sourceKey: "removed:retroactive",
    }),
  );

  const held = await run(t, fixture);
  expect(held).toMatchObject({ status: "needsAttention", lastError: "earning_period_changed" });
  expect(held.nextCheckAt).toBeUndefined();
  expect(await t.run((ctx) => ctx.db.query("payouts").take(3))).toEqual(before);
});

test.each([0, 20_000])(
  "zero increments complete without extra payouts after a %i cent cap",
  async (cap) => {
    const t = convexTest(schema, modules);
    const fixture = await seedScheduledEarnings(t, {
      fixedFeeCents: cap === 0 ? 0 : 10_000,
      cpmRateCents: cap === 0 ? 0 : 10_000,
      paymentCapCents: cap,
    });
    await fixture.snapshot(0, 0);
    vi.setSystemTime(START + 30 * DAY);
    await fixture.snapshot(7, 1_000);

    expect((await run(t, fixture)).status).toBe("complete");
    const payouts = await t.run((ctx) => ctx.db.query("payouts").take(2));
    expect(payouts.map((row) => row.amount)).toEqual(cap === 0 ? [] : [20_000]);
    expect(await t.run((ctx) => ctx.db.query("earningCalculations").take(6))).toHaveLength(5);
  },
);

test("a pathological stored window is parked without unbounded work or partial payouts", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t);
  await t.run((ctx) =>
    ctx.db.patch("deliverableEarnings", fixture.earningsId, { endsAt: START + 65 * 7 * DAY }),
  );
  vi.setSystemTime(START + 7 * DAY);

  expect(await run(t, fixture)).toMatchObject({
    status: "needsAttention",
    lastError: "earning_window_too_large",
  });
  expect(await t.run((ctx) => ctx.db.query("payouts").take(1))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("earningCalculations").take(1))).toEqual([]);
});
