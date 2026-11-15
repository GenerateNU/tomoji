/// <reference types="vite/client" />
import migrationsTest from "@convex-dev/migrations/test";
import { omit } from "convex-helpers";
import { convexTest } from "convex-test";
import { createFunctionHandle, getFunctionName } from "convex/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { components, internal } from "../../_generated/api";
import schema from "../../schema";
import { seedAssignmentFixture, seedPayout, seedPost, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
const migration =
  internal.migrations["2026_11_11_backfill_earnings_schedules"].backfillEarningsSchedules;
const START = Date.UTC(2026, 8, 1);
const DAY = 86_400_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START + 40 * DAY);
});
afterEach(() => vi.useRealTimers());

function setup() {
  const t = convexTest(schema, modules);
  migrationsTest.register(t);
  return t;
}

async function seedAgreements(t: TestConvex, count: number) {
  const fixture = await seedAssignmentFixture(t);
  const agreements = [];
  for (let index = 0; index < count; index++) {
    const assignmentId = await t.run(async (ctx) => {
      const original = (await ctx.db.get("assignments", fixture.assignmentId))!;
      return index === 0
        ? original._id
        : await ctx.db.insert("assignments", omit(original, ["_id", "_creationTime"]));
    });
    const postId = await seedPost(t, assignmentId);
    const earningsId = await t.run(async (ctx) => {
      const assignment = (await ctx.db.get("assignments", assignmentId))!;
      return await ctx.db.insert("deliverableEarnings", {
        assignmentId,
        deliverableId: fixture.deliverableId,
        postId,
        creatorId: assignment.creatorId,
        companyId: assignment.companyId,
        campaignId: assignment.campaignId,
        fixedFeeCents: assignment.fixedFeeCents,
        cpmRateCents: assignment.cpmRateCents,
        paymentCapCents: assignment.paymentCapCents,
        currency: "usd",
        policyVersion: 1,
        startedAt: START,
        endsAt: START + 30 * DAY,
      });
    });
    agreements.push({ earningsId, assignmentId, postId });
  }
  return agreements;
}

async function runMigration(t: TestConvex, reset = false) {
  await t.mutation(internal.migrations.runner.run, {
    fn: getFunctionName(migration),
    reset,
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

test("the component runner backfills multiple batches without creating earnings or payouts", async () => {
  const t = setup();
  await seedAgreements(t, 26);
  const before = await t.run((ctx) => ctx.db.query("deliverableEarnings").take(27));

  const fnHandle = await t.run(() => createFunctionHandle(migration));
  const firstBatch = await t.mutation(components.migrations.lib.migrate, {
    name: getFunctionName(migration),
    fnHandle,
    cursor: null,
    dryRun: false,
    oneBatchOnly: true,
  });
  expect(firstBatch).toMatchObject({ processed: 25, isDone: false });
  expect(await t.run((ctx) => ctx.db.query("earningsSchedules").take(27))).toHaveLength(25);

  await runMigration(t);

  const schedules = await t.run((ctx) => ctx.db.query("earningsSchedules").take(27));
  expect(schedules).toHaveLength(26);
  expect(new Set(schedules.map((row) => row.earningsId)).size).toBe(26);
  expect(schedules.every((row) => row.nextCheckAt === START + 7 * DAY)).toBe(true);
  expect(await t.run((ctx) => ctx.db.query("deliverableEarnings").take(27))).toEqual(before);
  expect(await t.run((ctx) => ctx.db.query("payouts").take(1))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("earningCalculations").take(1))).toEqual([]);
  expect(
    await t.query(components.migrations.lib.getStatus, { names: [getFunctionName(migration)] }),
  ).toMatchObject([{ isDone: true, state: "success", processed: 26 }]);
});

test("resetting the migration preserves existing progress, retry metadata, and payouts", async () => {
  const t = setup();
  const [agreement] = await seedAgreements(t, 1);
  await seedPayout(t, agreement.assignmentId, { postId: agreement.postId });
  await runMigration(t);
  await t.run(async (ctx) => {
    const schedule = (await ctx.db.query("earningsSchedules").first())!;
    await ctx.db.patch("earningsSchedules", schedule._id, {
      status: "needsAttention",
      nextCheckAt: undefined,
      lastAttemptedAt: Date.now(),
      lastAttemptedPeriodIndex: 4,
      retryCount: 3,
      lastError: "metric_evidence_missing",
    });
  });
  const before = await t.run(async (ctx) => ({
    schedules: await ctx.db.query("earningsSchedules").take(2),
    payouts: await ctx.db.query("payouts").take(2),
    agreements: await ctx.db.query("deliverableEarnings").take(2),
  }));

  await runMigration(t, true);

  expect(
    await t.run(async (ctx) => ({
      schedules: await ctx.db.query("earningsSchedules").take(2),
      payouts: await ctx.db.query("payouts").take(2),
      agreements: await ctx.db.query("deliverableEarnings").take(2),
    })),
  ).toEqual(before);
});

test("invalid historical context is flagged without blocking valid agreements or inventing legacy clocks", async () => {
  const t = setup();
  const [invalid, missing, valid] = await seedAgreements(t, 3);
  const legacyPostId = await seedPost(t, valid.assignmentId);
  await t.run(async (ctx) => {
    await ctx.db.patch("deliverableEarnings", invalid.earningsId, { endsAt: START - DAY });
    await ctx.db.delete("assignments", missing.assignmentId);
  });

  await runMigration(t);

  const schedules = await t.run((ctx) => ctx.db.query("earningsSchedules").take(4));
  expect(schedules).toHaveLength(3);
  expect(schedules.find((row) => row.earningsId === invalid.earningsId)).toMatchObject({
    status: "needsAttention",
    lastError: "earning_timeline_invalid",
  });
  expect(schedules.find((row) => row.earningsId === missing.earningsId)).toMatchObject({
    status: "needsAttention",
    lastError: "assignment_missing",
  });
  expect(schedules.find((row) => row.earningsId === valid.earningsId)).toMatchObject({
    status: "scheduled",
    nextCheckAt: START + 7 * DAY,
  });
  expect(await t.run((ctx) => ctx.db.query("deliverableEarnings").take(4))).toHaveLength(3);
  expect(await t.run((ctx) => ctx.db.get("posts", legacyPostId))).not.toHaveProperty(
    "firstVerifiedAt",
  );
});
