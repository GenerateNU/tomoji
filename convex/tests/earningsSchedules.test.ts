/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation } from "../_generated/server";
import { getDueEarningsSchedules } from "../models/earningsSchedules";
import schema from "../schema";
import {
  expectApiError,
  DAY,
  EARNINGS_TEST_START as START,
  seedScheduledEarnings,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

afterEach(() => vi.useRealTimers());

test("the sweep rejects a future cutoff without scheduling work", async () => {
  const t = convexTest(schema, modules);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  await expectApiError(
    () => t.run((ctx) => getDueEarningsSchedules(ctx, { cursor: "", cutoff: START + 1 })),
    "invalid_state",
    "earnings_sweep_cutoff_invalid",
  );
  expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(1))).toEqual([]);
});

test("the sweep advances past a full page of pending metrics and retains its original cutoff", async () => {
  const t = convexTest(schema, modules);
  vi.useFakeTimers();
  vi.setSystemTime(START);
  for (let index = 0; index < 25; index++) await seedScheduledEarnings(t);
  const last = await seedScheduledEarnings(t, { cpmRateCents: 0 });
  const parked = await seedScheduledEarnings(t);
  await t.run((ctx) =>
    ctx.db.patch("earningsSchedules", parked.scheduleId, {
      status: "needsAttention",
      nextCheckAt: undefined,
    }),
  );
  vi.setSystemTime(START + 1);
  const future = await seedScheduledEarnings(t, { cpmRateCents: 0 });
  vi.setSystemTime(START + 7 * DAY);

  await t.mutation(internal.earningsSchedules.sweep, {});
  const queued = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(30));
  expect(queued.filter((job) => job.name === "earningsSchedules:run")).toHaveLength(25);
  expect(queued.find((job) => job.name === "earningsSchedules:sweep")?.args).toEqual([
    { continuation: { cursor: expect.any(String), cutoff: START + 7 * DAY } },
  ]);

  vi.setSystemTime(START + 7 * DAY + 2);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const payouts = await t.run((ctx) => ctx.db.query("payouts").take(30));
  expect(payouts).toHaveLength(26);
  expect(payouts.some((payout) => payout.assignmentId === last.assignmentId)).toBe(true);
  expect(payouts.some((payout) => payout.assignmentId === future.assignmentId)).toBe(false);
  expect(payouts.some((payout) => payout.assignmentId === parked.assignmentId)).toBe(false);
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(40));
  expect(jobs.every((job) => job.state.kind === "success")).toBe(true);

  await t.mutation(internal.earningsSchedules.sweep, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  expect(await t.run((ctx) => ctx.db.query("payouts").take(30))).toHaveLength(27);
});

test("overlapping sweeps and stale queued workers preserve one obligation and its review deadline", async () => {
  const t = convexTest(schema, modules);
  vi.useFakeTimers();
  vi.setSystemTime(START);
  const fixture = await seedScheduledEarnings(t, { cpmRateCents: 0 });
  vi.setSystemTime(START + 30 * DAY);
  await Promise.all([
    t.mutation(internal.earningsSchedules.sweep, {}),
    t.mutation(internal.earningsSchedules.sweep, {}),
  ]);
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const payouts = await t.run((ctx) => ctx.db.query("payouts").take(2));
  expect(payouts).toHaveLength(1);
  expect(payouts[0]).toMatchObject({
    amount: 10_000,
    reviewRequestedAt: START + 30 * DAY,
    approvalDueAt: START + 33 * DAY,
  });
  await t.mutation(internal.earningsSchedules.run, {
    scheduleId: fixture.scheduleId,
    expectedNextCheckAt: START + 7 * DAY,
  });
  expect(await t.run((ctx) => ctx.db.query("payouts").take(2))).toEqual(payouts);
  expect(await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId))).toMatchObject({
    status: "complete",
    lastAttemptedPeriodIndex: 4,
  });
});

test.each(["exception", "transaction limit", "query limit"])(
  "a worker %s rolls back its settlement without blocking another agreement",
  async (failure) => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
    const t = convexTest({
      schema,
      transactionLimits: true,
      modules: {
        ...modules,
        "../earningsSchedules.ts": async () => {
          const original = await import("../earningsSchedules");
          const { earningsScheduleRun, processEarningsSchedule } =
            await import("../models/earningsScheduler");
          return {
            ...original,
            process: internalMutation({
              args: earningsScheduleRun.fields,
              returns: v.union(earningsScheduleRun, v.null()),
              handler: async (ctx, args) => {
                const continuation = await processEarningsSchedule(ctx, args);
                if (args.scheduleId === failed.scheduleId) {
                  if (failure === "exception") throw new Error("Injected failure after settlement");
                  if (failure === "query limit") {
                    for (let index = 0; index < 3_501; index++) {
                      await ctx.db.get("earningsSchedules", args.scheduleId);
                    }
                  }
                  // Exceed only the nested mutation's limit, preserving the wrapper's
                  // budget to record the failure after all settlement writes roll back.
                  for (let index = 0; index < 2_001; index++) {
                    await ctx.db.patch("earningsSchedules", args.scheduleId, {
                      lastError: "injected",
                    });
                  }
                }
                return continuation;
              },
            }),
          };
        },
      },
    });
    const failed = await seedScheduledEarnings(t, { cpmRateCents: 0 });
    const valid = await seedScheduledEarnings(t, { cpmRateCents: 0 });
    vi.setSystemTime(START + 7 * DAY);
    await t.mutation(internal.earningsSchedules.sweep, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const payouts = await t.run((ctx) => ctx.db.query("payouts").take(3));
    expect(payouts).toHaveLength(1);
    expect(payouts[0].assignmentId).toBe(valid.assignmentId);
    const calculations = await t.run((ctx) => ctx.db.query("earningCalculations").take(3));
    expect(calculations).toHaveLength(1);
    expect(calculations[0].earningsId).toBe(valid.earningsId);
    const schedule = await t.run((ctx) => ctx.db.get("earningsSchedules", failed.scheduleId));
    expect(schedule).toMatchObject({
      status: "scheduled",
      retryCount: 1,
      lastError: expect.any(String),
    });
    expect(schedule!.nextCheckAt).toBeGreaterThan(Date.now());
  },
);

test("a later period failure preserves committed earnings and retries without duplicates", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  let injectFailure = true;
  const t = convexTest({
    schema,
    transactionLimits: true,
    modules: {
      ...modules,
      "../earningsSchedules.ts": async () => {
        const original = await import("../earningsSchedules");
        const { earningsScheduleRun, processEarningsSchedule } =
          await import("../models/earningsScheduler");
        return {
          ...original,
          process: internalMutation({
            args: earningsScheduleRun.fields,
            returns: v.union(earningsScheduleRun, v.null()),
            handler: async (ctx, args) => {
              const before = (await ctx.db.get("earningsSchedules", args.scheduleId))!;
              const continuation = await processEarningsSchedule(ctx, args);
              if (injectFailure && before.scan?.nextPeriodIndex === 1) {
                throw new Error("Injected failure after second period settlement");
              }
              return continuation;
            },
          }),
        };
      },
    },
  });
  const fixture = await seedScheduledEarnings(t);
  vi.setSystemTime(START + 30 * DAY);
  await fixture.snapshot(0, 0);
  await fixture.snapshot(7, 100);
  await fixture.snapshot(14, 300);
  await t.mutation(internal.earningsSchedules.sweep, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const firstPayouts = await t.run((ctx) => ctx.db.query("payouts").take(3));
  expect(firstPayouts).toHaveLength(1);
  expect(firstPayouts[0].amount).toBe(11_000);
  const failed = (await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId)))!;
  expect(failed).toMatchObject({
    status: "scheduled",
    retryCount: 1,
    lastError: "settlement_execution_failed",
    scan: { nextPeriodIndex: 1, pendingMetrics: false },
  });
  expect(await t.run((ctx) => ctx.db.query("earningCalculations").take(3))).toHaveLength(1);

  injectFailure = false;
  vi.setSystemTime(failed.nextCheckAt!);
  await t.mutation(internal.earningsSchedules.sweep, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
  const payouts = await t.run((ctx) => ctx.db.query("payouts").take(3));
  expect(payouts.map((payout) => payout.amount)).toEqual([11_000, 2_000]);
  expect(payouts[0]).toEqual(firstPayouts[0]);
  expect(payouts[1].approvalDueAt).toBe(payouts[1].reviewRequestedAt + 3 * DAY);
  expect(payouts[1].reviewRequestedAt).toBe(failed.nextCheckAt);
  const resumed = (await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId)))!;
  expect(resumed).toMatchObject({ retryCount: 0, lastError: "metric_evidence_missing" });
  expect(resumed.scan).toBeUndefined();

  await t.mutation(internal.earningsSchedules.run, {
    scheduleId: fixture.scheduleId,
    expectedNextCheckAt: failed.nextCheckAt!,
  });
  expect(await t.run((ctx) => ctx.db.query("payouts").take(3))).toEqual(payouts);
});

test("all scheduler routes are internal and reject caller-selected amounts", async () => {
  const routes = await import("../earningsSchedules");
  for (const route of [routes.sweep, routes.run, routes.process, routes.retry]) {
    expect(route).toHaveProperty("isInternal", true);
    expect(route).not.toHaveProperty("isPublic");
  }
  const t = convexTest(schema, modules);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  const fixture = await seedScheduledEarnings(t);
  const untrustedInput = {
    scheduleId: fixture.scheduleId,
    expectedNextCheckAt: START + 7 * DAY,
    amount: 999_999,
  };
  await expect(t.mutation(internal.earningsSchedules.run, untrustedInput)).rejects.toThrow();
  expect(await t.run((ctx) => ctx.db.query("payouts").take(1))).toEqual([]);
});
