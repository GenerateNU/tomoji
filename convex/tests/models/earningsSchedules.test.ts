/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import {
  bringForwardEarningsSchedule,
  ensureEarningsSchedule,
} from "../../models/earningsSchedules";
import schema from "../../schema";
import { seedAssignmentFixture, seedPost, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
const START = Date.UTC(2026, 10, 11, 12);
const DAY = 86_400_000;

afterEach(() => vi.useRealTimers());

async function fixture(t: TestConvex) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  const assignment = await seedAssignmentFixture(t);
  const postId = await seedPost(t, assignment.assignmentId);
  const earningsId = await t.run(async (ctx) => {
    const row = (await ctx.db.get("assignments", assignment.assignmentId))!;
    return await ctx.db.insert("deliverableEarnings", {
      assignmentId: row._id,
      deliverableId: assignment.deliverableId,
      postId,
      creatorId: row.creatorId,
      companyId: row.companyId,
      campaignId: row.campaignId,
      fixedFeeCents: row.fixedFeeCents,
      cpmRateCents: row.cpmRateCents,
      paymentCapCents: row.paymentCapCents,
      currency: "usd",
      policyVersion: 1,
      startedAt: START,
      endsAt: START + 30 * DAY,
    });
  });
  return { ...assignment, earningsId };
}

test("initializes one schedule at the stored first period end without recording earnings", async () => {
  const t = convexTest(schema, modules);
  const { earningsId } = await fixture(t);
  const first = await t.run((ctx) => ensureEarningsSchedule(ctx, earningsId));
  expect(first).toMatchObject({
    earningsId,
    status: "scheduled",
    nextCheckAt: START + 7 * DAY,
    retryCount: 0,
  });
  vi.setSystemTime(START + 40 * DAY);
  expect(await t.run((ctx) => ensureEarningsSchedule(ctx, earningsId))).toEqual(first);
  expect(await t.run((ctx) => ctx.db.query("earningsSchedules").take(2))).toEqual([first]);
  expect(await t.run((ctx) => ctx.db.query("payouts").take(1))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("earningCalculations").take(1))).toEqual([]);
});

test("initialization uses the earlier assignment or removal cutoff, even after the window", async () => {
  const t = convexTest(schema, modules);
  const { earningsId, assignmentId } = await fixture(t);
  vi.setSystemTime(START + 40 * DAY);
  await t.run(async (ctx) => {
    await ctx.db.patch("assignments", assignmentId, {
      status: "cancelled",
      cancelledAt: START + 3 * DAY,
    });
    await ctx.db.patch("deliverableEarnings", earningsId, {
      cutoffAt: START + 5 * DAY,
      cutoffReason: "removed",
    });
  });
  expect(await t.run((ctx) => ensureEarningsSchedule(ctx, earningsId))).toMatchObject({
    status: "scheduled",
    nextCheckAt: START + 3 * DAY,
  });
});

test.each([
  ["unknown cancellation time", "cancellation_time_missing"],
  ["invalid window", "earning_timeline_invalid"],
  ["future verification", "earning_timeline_invalid"],
  ["cutoff before verification", "earning_timeline_invalid"],
  ["missing assignment", "assignment_missing"],
] as const)("parks %s without inventing a due date", async (scenario, reason) => {
  const t = convexTest(schema, modules);
  const { earningsId, assignmentId } = await fixture(t);
  await t.run(async (ctx) => {
    switch (scenario) {
      case "unknown cancellation time":
        await ctx.db.patch("assignments", assignmentId, { status: "cancelled" });
        break;
      case "invalid window":
        await ctx.db.patch("deliverableEarnings", earningsId, { endsAt: START });
        break;
      case "future verification":
        await ctx.db.patch("deliverableEarnings", earningsId, { startedAt: START + DAY });
        break;
      case "cutoff before verification":
        await ctx.db.patch("deliverableEarnings", earningsId, { cutoffAt: START - 1 });
        break;
      case "missing assignment":
        await ctx.db.delete("assignments", assignmentId);
    }
  });
  const schedule = await t.run((ctx) => ensureEarningsSchedule(ctx, earningsId));
  expect(schedule).toMatchObject({ status: "needsAttention", lastError: reason, retryCount: 0 });
  expect(schedule.nextCheckAt).toBeUndefined();
});

test("a cutoff after accrual ended does not reopen a completed schedule", async () => {
  const t = convexTest(schema, modules);
  const { earningsId, assignmentId } = await fixture(t);
  const schedule = await t.run((ctx) => ensureEarningsSchedule(ctx, earningsId));
  vi.setSystemTime(START + 40 * DAY);
  const completed = await t.run(async (ctx) => {
    await ctx.db.patch("earningsSchedules", schedule._id, {
      status: "complete",
      nextCheckAt: undefined,
      lastAttemptedAt: START + 30 * DAY,
      lastAttemptedPeriodIndex: 4,
    });
    await ctx.db.patch("assignments", assignmentId, {
      status: "cancelled",
      cancelledAt: START + 40 * DAY,
    });
    return await ctx.db.get("earningsSchedules", schedule._id);
  });
  expect(await t.run((ctx) => bringForwardEarningsSchedule(ctx, earningsId))).toEqual(completed);
});

test("an invalid retrospective cutoff parks due work and retains attempt diagnostics", async () => {
  const t = convexTest(schema, modules);
  const { earningsId } = await fixture(t);
  const schedule = await t.run((ctx) => ensureEarningsSchedule(ctx, earningsId));
  await t.run(async (ctx) => {
    await ctx.db.patch("earningsSchedules", schedule._id, {
      lastAttemptedAt: START,
      lastAttemptedPeriodIndex: 0,
      retryCount: 2,
    });
    await ctx.db.patch("deliverableEarnings", earningsId, { cutoffAt: START - 1 });
  });
  const parked = await t.run((ctx) => bringForwardEarningsSchedule(ctx, earningsId));
  expect(parked).toMatchObject({
    status: "needsAttention",
    lastError: "earning_timeline_invalid",
    lastAttemptedAt: START,
    lastAttemptedPeriodIndex: 0,
    retryCount: 2,
  });
  expect(parked.nextCheckAt).toBeUndefined();
});
