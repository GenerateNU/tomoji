/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import schema from "../schema";
import { DAY, EARNINGS_TEST_START as START, seedPayout, seedScheduledEarnings } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

afterEach(() => vi.useRealTimers());

test("catch-up preserves the fixed fee when valid legacy history exceeds one transaction's byte budget", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  const t = convexTest({ schema, modules, transactionLimits: true });
  const fixture = await seedScheduledEarnings(t);
  await t.run(async (ctx) => {
    const post = (await ctx.db.get("posts", fixture.postId))!;
    await ctx.db.patch("submissions", post.submissionId, {
      draftDescription: "a".repeat(5000),
      reviewNote: "r".repeat(2000),
    });
  });
  // Exactly 256 rows are accepted by settlement's legacy-history guard. Reading
  // their allowed-size submission once per overdue period used to roll back all work.
  for (let index = 0; index < 256; index++) {
    await seedPayout(t, fixture.assignmentId, { postId: fixture.postId, amount: 1 });
  }
  vi.setSystemTime(START + 30 * DAY);
  await t.mutation(internal.earningsSchedules.sweep, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const payouts = await t.run((ctx) => ctx.db.query("payouts").take(258));
  expect(payouts).toHaveLength(257);
  const fixedPayout = payouts.find((payout) => payout.deliverableId === fixture.deliverableId)!;
  expect(fixedPayout).toMatchObject({
    amount: 9_744,
    approvalStatus: "pending",
    paymentStatus: "notStarted",
  });
  expect(fixedPayout.reviewRequestedAt).toBeGreaterThanOrEqual(START + 30 * DAY);
  expect(fixedPayout.reviewRequestedAt).toBeLessThanOrEqual(Date.now());
  expect(fixedPayout.approvalDueAt).toBe(fixedPayout.reviewRequestedAt + 3 * DAY);
  const schedule = (await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId)))!;
  expect(schedule).toMatchObject({
    status: "scheduled",
    retryCount: 0,
    lastAttemptedPeriodIndex: 4,
    lastError: "metric_evidence_missing",
  });
  expect(schedule.nextCheckAt).toBe(Date.now() + 60 * 60_000);
  const calculations = await t.run((ctx) => ctx.db.query("earningCalculations").take(10));
  expect(calculations.filter((row) => row.status === "pendingMetrics")).toHaveLength(5);
  expect(calculations.filter((row) => row.payoutId === fixedPayout._id)).toHaveLength(1);

  vi.setSystemTime(schedule.nextCheckAt!);
  await t.mutation(internal.earningsSchedules.sweep, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.query("payouts").take(258))).toEqual(payouts);
  expect(await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId))).toMatchObject({
    status: "scheduled",
    retryCount: 0,
    lastError: "metric_evidence_missing",
  });
});

test("an extended stored window catches up without exhausting the query budget", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  const t = convexTest({ schema, modules, transactionLimits: true });
  const fixture = await seedScheduledEarnings(t);
  // Imported windows are accepted up to 64 periods. This is deliberately larger
  // than the default policy and guards the scheduler's supported upper bound.
  await t.run((ctx) =>
    ctx.db.patch("deliverableEarnings", fixture.earningsId, { endsAt: START + 64 * 7 * DAY }),
  );
  for (let index = 0; index < 50; index++) {
    await seedPayout(t, fixture.assignmentId, { postId: fixture.postId, amount: 1 });
  }
  vi.setSystemTime(START + 64 * 7 * DAY);
  await t.mutation(internal.earningsSchedules.sweep, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const payouts = await t.run((ctx) => ctx.db.query("payouts").take(52));
  expect(payouts).toHaveLength(51);
  const fixedPayout = payouts.find((payout) => payout.deliverableId === fixture.deliverableId)!;
  expect(fixedPayout).toMatchObject({
    amount: 9_950,
    approvalStatus: "pending",
  });
  const calculations = await t.run((ctx) => ctx.db.query("earningCalculations").take(66));
  expect(calculations.filter((row) => row.status === "pendingMetrics")).toHaveLength(64);
  const schedule = (await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId)))!;
  expect(schedule).toMatchObject({
    status: "scheduled",
    retryCount: 0,
    lastAttemptedPeriodIndex: 63,
    lastError: "metric_evidence_missing",
  });
  expect(schedule.nextCheckAt).toBe(Date.now() + 60 * 60_000);

  // A delayed final measurement covers the earlier missing periods. The pending
  // flag must clear across transaction boundaries without issuing the fixed fee again.
  await fixture.snapshot(0, 0);
  await fixture.snapshot(64 * 7, 100);
  vi.setSystemTime(schedule.nextCheckAt!);
  await t.mutation(internal.earningsSchedules.sweep, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const settledPayouts = await t.run((ctx) => ctx.db.query("payouts").take(53));
  expect(settledPayouts).toHaveLength(52);
  expect(settledPayouts.find((payout) => payout._id === fixedPayout._id)).toEqual(fixedPayout);
  const variablePayouts = settledPayouts.filter(
    (payout) => payout.deliverableId === fixture.deliverableId && payout._id !== fixedPayout._id,
  );
  expect(variablePayouts).toHaveLength(1);
  expect(variablePayouts[0]).toMatchObject({ amount: 1_000, approvalStatus: "pending" });
  expect(variablePayouts[0].approvalDueAt).toBe(variablePayouts[0].reviewRequestedAt + 3 * DAY);
  const settledCalculations = await t.run((ctx) => ctx.db.query("earningCalculations").take(66));
  expect(settledCalculations.filter((row) => row.status === "covered")).toHaveLength(63);
  expect(settledCalculations.some((row) => row.status === "pendingMetrics")).toBe(false);
  const completed = (await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId)))!;
  expect(completed).toMatchObject({ status: "complete", retryCount: 0 });
  expect(completed.scan).toBeUndefined();
  expect(completed.nextCheckAt).toBeUndefined();
});
