/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { listEarningCalculations, requireEarningsDetails } from "../../models/earningsHistory";
import { settleEarnings } from "../../models/earnings";
import schema from "../../schema";
import { DAY, EARNINGS_TEST_START as START, seedScheduledEarnings } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

test("earnings details return agreed terms, verification window, and safe schedule context", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t);
  await t.run((ctx) =>
    ctx.db.patch("earningsSchedules", fixture.scheduleId, {
      retryCount: 2,
      lastError: "private execution details",
      lastAttemptedAt: START,
    }),
  );
  const before = await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId));
  const detail = await t.run((ctx) =>
    requireEarningsDetails(ctx, { role: "creator", creatorId: fixture.creatorId }, fixture),
  );
  expect(detail).toMatchObject({
    _id: fixture.earningsId,
    assignmentId: fixture.assignmentId,
    deliverableId: fixture.deliverableId,
    fixedFeeCents: 10_000,
    cpmRateCents: 10_000,
    paymentCapCents: 20_000,
    currency: "usd",
    startedAt: START,
    endsAt: START + 30 * DAY,
    window: { status: "known", effectiveEndsAt: START + 30 * DAY },
  });
  expect(detail.schedule).toEqual({ status: "scheduled", nextCheckAt: START + 7 * DAY });
  expect(await t.run((ctx) => ctx.db.get("earningsSchedules", fixture.scheduleId))).toEqual(before);
  expect(await t.run((ctx) => ctx.db.query("earningCalculations").take(1))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("payouts").take(1))).toEqual([]);
});

test("calculation history keeps missing metrics distinct from recorded fixed earnings", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t);
  await fixture.snapshot(0, 50);
  vi.setSystemTime(START + 7 * DAY);
  await t.run((ctx) => settleEarnings(ctx, { ...fixture, periodIndex: 0 }));
  const history = await t.run((ctx) =>
    listEarningCalculations(
      ctx,
      { role: "creator", creatorId: fixture.creatorId },
      { ...fixture, paginationOpts: { numItems: 10, cursor: null } },
    ),
  );
  expect(history.page).toHaveLength(2);
  const fixed = history.page.find((row) => row.component === "fixed")!;
  const pending = history.page.find((row) => row.component === "variable")!;
  expect(fixed).toMatchObject({
    status: "recorded",
    newFixedCents: 10_000,
    newPayoutCents: 10_000,
  });
  expect(fixed.payoutId).toBeDefined();
  expect(pending.status).toBe("pendingMetrics");
  for (const field of ["newFixedCents", "newVariableCents", "newPayoutCents", "payoutId"])
    expect(pending).not.toHaveProperty(field);
  for (const row of history.page) {
    for (const field of [
      "sourceKey",
      "reason",
      "baselineSnapshotId",
      "cutoffSnapshotId",
      "totalEarnedCents",
      "previouslyRecordedEarningsCents",
    ])
      expect(row).not.toHaveProperty(field);
  }
});

test("covered periods and zero increments paginate without adding duplicate earnings", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t);
  const viewer = { role: "creator" as const, creatorId: fixture.creatorId };
  await fixture.snapshot(0, 50);
  vi.setSystemTime(START + 7 * DAY);
  await t.run((ctx) => settleEarnings(ctx, { ...fixture, periodIndex: 0 }));
  vi.setSystemTime(START + 14 * DAY);
  await fixture.snapshot(14, 350);
  await t.run((ctx) => settleEarnings(ctx, { ...fixture, periodIndex: 1 }));
  vi.setSystemTime(START + 21 * DAY);
  await fixture.snapshot(21, 350);
  await t.run((ctx) => settleEarnings(ctx, { ...fixture, periodIndex: 2 }));
  const before = await t.run(async (ctx) => ({
    payouts: await ctx.db.query("payouts").take(10),
    calculations: await ctx.db.query("earningCalculations").take(10),
    schedule: await ctx.db.get("earningsSchedules", fixture.scheduleId),
  }));
  const all = await t.run((ctx) =>
    listEarningCalculations(ctx, viewer, {
      ...fixture,
      paginationOpts: { numItems: 10, cursor: null },
    }),
  );
  expect(all.page.map((row) => row.periodIndex)).toEqual([2, 1, 0, 0]);
  const covered = all.page.find((row) => row.status === "covered")!;
  const covering = all.page.find((row) => row.periodIndex === 1)!;
  expect(covered.coveredByCalculationId).toBe(covering._id);
  expect(covered).not.toHaveProperty("newPayoutCents");
  expect(covered).not.toHaveProperty("payoutId");
  expect(covering).toMatchObject({
    newVariableCents: 3_000,
    newPayoutCents: 3_000,
    coverageStartsAt: START,
  });
  expect(all.page[0]).toMatchObject({ status: "recorded", newPayoutCents: 0 });
  expect(all.page[0]).not.toHaveProperty("payoutId");
  expect(all.page.reduce((sum, row) => sum + (row.newPayoutCents ?? 0), 0)).toBe(13_000);
  expect(all.page.flatMap((row) => (row.payoutId ? [row.payoutId] : [])).sort()).toEqual(
    before.payouts.map((row) => row._id).sort(),
  );

  const pagedIds = [];
  let cursor: string | null = null;
  for (let pageIndex = 0; pageIndex < 5; pageIndex++) {
    const page = await t.run((ctx) =>
      listEarningCalculations(ctx, viewer, {
        ...fixture,
        paginationOpts: { numItems: 1, cursor, maximumRowsRead: 1 },
      }),
    );
    pagedIds.push(...page.page.map((row) => row._id));
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  expect(pagedIds).toEqual(all.page.map((row) => row._id));
  expect(
    await t.run(async (ctx) => ({
      payouts: await ctx.db.query("payouts").take(10),
      calculations: await ctx.db.query("earningCalculations").take(10),
      schedule: await ctx.db.get("earningsSchedules", fixture.scheduleId),
    })),
  ).toEqual(before);
});

test.each([
  { removedDay: undefined, cancelledDay: 10, expectedDay: 10 },
  { removedDay: 3, cancelledDay: undefined, expectedDay: 3 },
  { removedDay: 20, cancelledDay: 10, expectedDay: 10 },
  { removedDay: 5, cancelledDay: 10, expectedDay: 5 },
  { removedDay: 35, cancelledDay: 40, expectedDay: 30 },
  { removedDay: 0, cancelledDay: undefined, expectedDay: 0 },
])(
  "the stored earning window respects cutoffs: %j",
  async ({ removedDay, cancelledDay, expectedDay }) => {
    const t = convexTest(schema, modules);
    const fixture = await seedScheduledEarnings(t);
    await t.run(async (ctx) => {
      if (removedDay !== undefined)
        await ctx.db.patch("deliverableEarnings", fixture.earningsId, {
          cutoffAt: START + removedDay * DAY,
          cutoffReason: "removed",
        });
      if (cancelledDay !== undefined)
        await ctx.db.patch("assignments", fixture.assignmentId, {
          status: "cancelled",
          cancelledAt: START + cancelledDay * DAY,
        });
    });
    vi.setSystemTime(START + 50 * DAY);
    const detail = await t.run((ctx) => requireEarningsDetails(ctx, { role: "operator" }, fixture));
    expect(detail.startedAt).toBe(START);
    expect(detail.endsAt).toBe(START + 30 * DAY);
    expect(detail.window).toEqual({ status: "known", effectiveEndsAt: START + expectedDay * DAY });
  },
);

test.each(["unknown cancellation", "invalid cutoff", "invalid window", "foreign parent"])(
  "incomplete timing remains explicit: %s",
  async (scenario) => {
    const t = convexTest(schema, modules);
    const fixture = await seedScheduledEarnings(t);
    await t.run(async (ctx) => {
      if (scenario === "unknown cancellation")
        await ctx.db.patch("assignments", fixture.assignmentId, {
          status: "cancelled",
          cancelledAt: undefined,
        });
      if (scenario === "invalid cutoff")
        await ctx.db.patch("deliverableEarnings", fixture.earningsId, { cutoffAt: START - 1 });
      if (scenario === "invalid window")
        await ctx.db.patch("deliverableEarnings", fixture.earningsId, { endsAt: START });
      if (scenario === "foreign parent") {
        const other = await ctx.db.insert("creators", { userId: fixture.creatorUserId });
        await ctx.db.patch("assignments", fixture.assignmentId, { creatorId: other });
      }
    });
    const detail = await t.run((ctx) =>
      requireEarningsDetails(ctx, { role: "creator", creatorId: fixture.creatorId }, fixture),
    );
    expect(detail.window).toEqual({ status: "needsAttention" });
    expect(detail.fixedFeeCents).toBe(10_000);
  },
);

test("historical details and calculations survive deleted parents without inventing schedule state", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t, { cpmRateCents: 0 });
  vi.setSystemTime(START + 7 * DAY);
  await t.run((ctx) => settleEarnings(ctx, { ...fixture, periodIndex: 0 }));
  const viewer = { role: "creator" as const, creatorId: fixture.creatorId };
  const args = { ...fixture, paginationOpts: { numItems: 10, cursor: null } };
  const before = await t.run((ctx) => listEarningCalculations(ctx, viewer, args));
  await t.run(async (ctx) => {
    const assignment = (await ctx.db.get("assignments", fixture.assignmentId))!;
    const post = (await ctx.db.get("posts", fixture.postId))!;
    await ctx.db.delete("submissions", post.submissionId);
    await ctx.db.delete("posts", fixture.postId);
    await ctx.db.delete("deliverables", fixture.deliverableId);
    await ctx.db.delete("assignments", fixture.assignmentId);
    await ctx.db.delete("campaigns", assignment.campaignId);
    await ctx.db.delete("earningsSchedules", fixture.scheduleId);
  });
  const detail = await t.run((ctx) => requireEarningsDetails(ctx, viewer, fixture));
  expect(detail).toMatchObject({
    _id: fixture.earningsId,
    window: { status: "needsAttention" },
    schedule: null,
  });
  expect(await t.run((ctx) => listEarningCalculations(ctx, viewer, args))).toEqual(before);
  expect(await t.run((ctx) => ctx.db.query("earningsSchedules").take(1))).toEqual([]);
});

test("attention states expose safe status without execution diagnostics or invented amounts", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedScheduledEarnings(t);
  await t.run(async (ctx) => {
    await ctx.db.patch("deliverableEarnings", fixture.earningsId, {
      variableHoldReason: "post_replaced",
    });
    await ctx.db.patch("earningsSchedules", fixture.scheduleId, {
      status: "needsAttention",
      nextCheckAt: undefined,
      lastError: "private raw failure",
      retryCount: 5,
    });
  });
  vi.setSystemTime(START + 7 * DAY);
  await t.run((ctx) => settleEarnings(ctx, { ...fixture, periodIndex: 0 }));
  const detail = await t.run((ctx) => requireEarningsDetails(ctx, { role: "operator" }, fixture));
  expect(detail.schedule).toEqual({ status: "needsAttention" });
  expect(detail.variableHoldReason).toBe("post_replaced");
  const history = await t.run((ctx) =>
    listEarningCalculations(
      ctx,
      { role: "operator" },
      {
        ...fixture,
        paginationOpts: { numItems: 10, cursor: null },
      },
    ),
  );
  const held = history.page.find((row) => row.status === "needsAttention")!;
  expect(held).toBeDefined();
  expect(held).not.toHaveProperty("reason");
  expect(held).not.toHaveProperty("newPayoutCents");
});
