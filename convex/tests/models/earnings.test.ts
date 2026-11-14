/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { settleEarnings } from "../../models/earnings";
import { recordPostRemoval, recordPostViewSnapshot } from "../../models/earningSources";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignmentFixture,
  seedDeliverable,
  seedPayout,
  seedPost,
  seedSubmission,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
const DAY = 86_400_000;
const START = 1_800_000_000_000;

afterEach(() => vi.useRealTimers());

async function setup(t: TestConvex) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  const fixture = await seedAssignmentFixture(t);
  const postId = await seedPost(t, fixture.assignmentId);
  const earningsId = await t.run(async (ctx) => {
    const assignment = (await ctx.db.get("assignments", fixture.assignmentId))!;
    return await ctx.db.insert("deliverableEarnings", {
      assignmentId: fixture.assignmentId,
      deliverableId: fixture.deliverableId,
      postId,
      creatorId: assignment.creatorId,
      companyId: assignment.companyId,
      campaignId: assignment.campaignId,
      fixedFeeCents: 10_000,
      cpmRateCents: 10_000,
      paymentCapCents: 20_000,
      currency: "usd",
      policyVersion: 1,
      startedAt: START,
      endsAt: START + 30 * DAY,
    });
  });
  const snapshot = async (day: number, views: number) =>
    await t.run(
      async (ctx) =>
        await ctx.db.insert("postViewSnapshots", {
          postId,
          observedAt: START + day * DAY,
          receivedAt: Date.now(),
          views,
          sourceKey: `test:${day}`,
        }),
    );
  const settle = async (periodIndex: number) =>
    await t.run(
      async (ctx) =>
        await settleEarnings(ctx, {
          assignmentId: fixture.assignmentId,
          deliverableId: fixture.deliverableId,
          periodIndex,
        }),
    );
  return { ...fixture, postId, earningsId, snapshot, settle };
}

test("records the first fixed and variable earning atomically and retries the same obligation", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await fixture.snapshot(0, 50);
  vi.setSystemTime(START + 7 * DAY);
  await fixture.snapshot(7, 150);
  const result = await fixture.settle(0);
  expect(result).toMatchObject({ status: "recorded" });
  expect(result.payoutIds).toHaveLength(1);
  const payout = await t.run(async (ctx) => await ctx.db.get("payouts", result.payoutIds[0]));
  expect(payout).toMatchObject({
    amount: 11_000,
    currency: "usd",
    deliverableId: fixture.deliverableId,
    approvalStatus: "pending",
    paymentStatus: "notStarted",
    reviewRequestedAt: START + 7 * DAY,
    approvalDueAt: START + 10 * DAY,
  });
  vi.setSystemTime(START + 8 * DAY);
  expect(await fixture.settle(0)).toEqual(result);
  expect(await t.run(async (ctx) => await ctx.db.query("payouts").collect())).toHaveLength(1);
  const calculations = await t.run(
    async (ctx) => await ctx.db.query("earningCalculations").collect(),
  );
  expect(calculations).toHaveLength(1);
  expect(calculations[0]).toMatchObject({
    status: "recorded",
    component: "combined",
    cumulativeEligibleViews: 100,
    newFixedCents: 10_000,
    newVariableCents: 1_000,
    payoutId: payout!._id,
  });
});

test("records the five installments and counts failed collection as an existing obligation", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await fixture.snapshot(0, 200);
  const amounts: number[] = [];
  for (const [index, day, views] of [
    [0, 7, 300],
    [1, 14, 500],
    [2, 21, 800],
    [3, 28, 1100],
    [4, 30, 1400],
  ]) {
    vi.setSystemTime(START + day * DAY);
    await fixture.snapshot(day, views);
    const result = await fixture.settle(index);
    expect(result.status).toBe("recorded");
    const payout = (await t.run(async (ctx) => await ctx.db.get("payouts", result.payoutIds[0])))!;
    amounts.push(payout.amount);
    await t.run(
      async (ctx) => await ctx.db.patch("payouts", payout._id, { paymentStatus: "needsAttention" }),
    );
  }
  expect(amounts).toEqual([11_000, 2_000, 3_000, 3_000, 1_000]);
});

test("zero views still earn the fixed fee, later zero increments create only calculation records", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await fixture.snapshot(0, 50);
  vi.setSystemTime(START + 7 * DAY);
  await fixture.snapshot(7, 50);
  expect((await fixture.settle(0)).payoutIds).toHaveLength(1);
  vi.setSystemTime(START + 14 * DAY);
  await fixture.snapshot(14, 50);
  expect(await fixture.settle(1)).toMatchObject({ status: "recorded", payoutIds: [] });
  const rows = await t.run(async (ctx) => await ctx.db.query("payouts").collect());
  expect(rows.map((row) => row.amount)).toEqual([10_000]);
});

test("missing metrics release the fixed fee once and later evidence settles only the variable component", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  vi.setSystemTime(START + 7 * DAY);
  const first = await fixture.settle(0);
  expect(first).toMatchObject({ status: "pendingMetrics" });
  expect(first.payoutIds).toHaveLength(1);
  expect(await fixture.settle(0)).toEqual(first);
  await fixture.snapshot(0, 25);
  await fixture.snapshot(7, 125);
  const settled = await fixture.settle(0);
  expect(settled).toMatchObject({ status: "recorded" });
  expect(settled.payoutIds).toHaveLength(2);
  const amounts = await t.run(async (ctx) =>
    (await ctx.db.query("payouts").collect()).map((row) => row.amount),
  );
  expect(amounts).toEqual([10_000, 1_000]);
});

test("later cumulative evidence covers a missing earlier cutoff without inventing that earlier count", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await fixture.snapshot(0, 50);
  vi.setSystemTime(START + 7 * DAY);
  const first = await fixture.settle(0);
  expect(first.status).toBe("pendingMetrics");
  vi.setSystemTime(START + 14 * DAY);
  await fixture.snapshot(14, 350);
  const second = await fixture.settle(1);
  expect(second.status).toBe("recorded");
  const variable = (await t.run(async (ctx) => await ctx.db.get("payouts", second.payoutIds[0])))!;
  expect(variable).toMatchObject({
    amount: 3_000,
    earningPeriod: { startsAt: START, endsAt: START + 14 * DAY },
  });
  const earlier = await t.run(
    async (ctx) =>
      await ctx.db
        .query("earningCalculations")
        .withIndex("by_earningsId_and_periodIndex", (q) =>
          q.eq("earningsId", fixture.earningsId).eq("periodIndex", 0),
        )
        .collect(),
  );
  const covered = earlier.find((row) => row.component === "variable")!;
  expect(covered.status).toBe("covered");
  expect(covered).not.toHaveProperty("cutoffViews");
  expect(covered.coveredByCalculationId).toBe(second.calculationIds[0]);
  expect((await fixture.settle(0)).status).toBe("recorded");
  expect(await t.run(async (ctx) => await ctx.db.query("payouts").collect())).toHaveLength(2);
});

test("cancellation finalizes accrued earnings and preserves the full review period", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await fixture.snapshot(0, 0);
  vi.setSystemTime(START + 7 * DAY);
  await fixture.snapshot(7, 100);
  await fixture.settle(0);
  vi.setSystemTime(START + 11 * DAY);
  await t.run(
    async (ctx) =>
      await ctx.db.patch("assignments", fixture.assignmentId, {
        status: "cancelled",
        cancelledAt: START + 10 * DAY,
      }),
  );
  await fixture.snapshot(10, 300);
  const result = await fixture.settle(1);
  expect(result.status).toBe("recorded");
  expect(
    await t.run(async (ctx) => await ctx.db.get("payouts", result.payoutIds[0])),
  ).toMatchObject({
    amount: 2_000,
    earningPeriod: { startsAt: START + 7 * DAY, endsAt: START + 10 * DAY },
    reviewRequestedAt: START + 11 * DAY,
    approvalDueAt: START + 14 * DAY,
  });
  expect((await fixture.settle(2)).status).toBe("outsideWindow");
});

test("a delayed removal releases eligible earnings held only by later view regression", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  vi.setSystemTime(START + 5 * DAY);
  for (const [day, views] of [
    [0, 0],
    [3, 100],
    [4, 300],
    [5, 250],
  ]) {
    await t.run((ctx) =>
      recordPostViewSnapshot(ctx, {
        postId: fixture.postId,
        observedAt: START + day * DAY,
        views,
        sourceKey: `view:${day}`,
      }),
    );
  }
  expect(await t.run((ctx) => ctx.db.get("deliverableEarnings", fixture.earningsId))).toMatchObject(
    {
      variableHoldReason: "metric_count_regressed",
    },
  );
  await t.run((ctx) =>
    recordPostRemoval(ctx, {
      postId: fixture.postId,
      removedAt: START + 3 * DAY,
      sourceKey: "confirmed-removal",
    }),
  );
  const result = await fixture.settle(0);
  expect(result.status).toBe("recorded");
  expect(result.payoutIds).toHaveLength(1);
  expect(await t.run((ctx) => ctx.db.get("payouts", result.payoutIds[0]))).toMatchObject({
    amount: 11_000,
    earningPeriod: { startsAt: START, endsAt: START + 3 * DAY },
  });
  expect(await fixture.settle(0)).toEqual(result);
  expect(await t.run((ctx) => ctx.db.query("payouts").take(2))).toHaveLength(1);
});

test("same-instant removal settles the fixed fee without an invalid zero-length payout period", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await fixture.snapshot(0, 123);
  await t.run(
    async (ctx) =>
      await ctx.db.patch("deliverableEarnings", fixture.earningsId, {
        cutoffAt: START,
        cutoffReason: "removed",
      }),
  );
  const result = await fixture.settle(0);
  const payout = await t.run(async (ctx) => await ctx.db.get("payouts", result.payoutIds[0]));
  expect(payout).toMatchObject({ amount: 10_000 });
  expect(payout).not.toHaveProperty("earningPeriod");
});

test("legacy obligations with a resolvable deliverable count even when collection failed", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await seedPayout(t, fixture.assignmentId, {
    postId: fixture.postId,
    amount: 10_000,
    paymentStatus: "needsAttention",
  });
  await fixture.snapshot(0, 0);
  vi.setSystemTime(START + 7 * DAY);
  await fixture.snapshot(7, 100);
  const result = await fixture.settle(0);
  expect(
    await t.run(async (ctx) => await ctx.db.get("payouts", result.payoutIds[0])),
  ).toMatchObject({ amount: 1_000 });
});

test("concurrent settlement calls create one obligation and one final calculation", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await fixture.snapshot(0, 0);
  vi.setSystemTime(START + 7 * DAY);
  await fixture.snapshot(7, 100);
  const results = await Promise.all([fixture.settle(0), fixture.settle(0)]);
  expect(results[0]).toEqual(results[1]);
  expect(await t.run(async (ctx) => await ctx.db.query("payouts").collect())).toHaveLength(1);
  expect(
    await t.run(async (ctx) => await ctx.db.query("earningCalculations").collect()),
  ).toHaveLength(1);
});

test("settlement cannot run early or skip an unattempted period", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  expect((await fixture.settle(0)).status).toBe("notDue");
  vi.setSystemTime(START + 14 * DAY);
  expect(await fixture.settle(1)).toMatchObject({
    status: "needsAttention",
    reason: "earlier_period_unsettled",
  });
  expect(await t.run(async (ctx) => await ctx.db.query("payouts").collect())).toHaveLength(0);
});

test("fixed-only compensation does not wait for irrelevant metrics", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await t.run(
    async (ctx) =>
      await ctx.db.patch("deliverableEarnings", fixture.earningsId, { cpmRateCents: 0 }),
  );
  vi.setSystemTime(START + 7 * DAY);
  const result = await fixture.settle(0);
  expect(result.status).toBe("recorded");
  expect(result.payoutIds).toHaveLength(1);
  vi.setSystemTime(START + 14 * DAY);
  expect(await fixture.settle(1)).toMatchObject({ status: "recorded", payoutIds: [] });
});

test("immediate removal needs no view measurement to settle its fixed fee", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await t.run(
    async (ctx) =>
      await ctx.db.patch("deliverableEarnings", fixture.earningsId, {
        cutoffAt: START,
        cutoffReason: "removed",
      }),
  );
  expect((await fixture.settle(0)).status).toBe("recorded");
});

test("deliverables have independent fixed fees and caps", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  const secondDeliverableId = await seedDeliverable(t, fixture);
  const secondSubmissionId = await seedSubmission(
    t,
    { ...fixture, deliverableId: secondDeliverableId },
    "approved",
  );
  const secondPostId = await t.run(async (ctx) => {
    const original = (await ctx.db.get("posts", fixture.postId))!;
    return await ctx.db.insert("posts", {
      submissionId: secondSubmissionId,
      campaignId: original.campaignId,
      isActive: true,
      isVerified: true,
      xPostId: "second-deliverable",
      url: "https://x.com/creator/status/2",
    });
  });
  await t.run(async (ctx) => {
    const original = (await ctx.db.get("deliverableEarnings", fixture.earningsId))!;
    const { _id, _creationTime, ...fields } = original;
    void _id;
    void _creationTime;
    await ctx.db.insert("deliverableEarnings", {
      ...fields,
      deliverableId: secondDeliverableId,
      postId: secondPostId,
    });
  });
  await fixture.snapshot(0, 0);
  vi.setSystemTime(START + 7 * DAY);
  await fixture.snapshot(7, 1000);
  await t.run(async (ctx) => {
    for (const [day, views] of [
      [0, 0],
      [7, 1000],
    ]) {
      await ctx.db.insert("postViewSnapshots", {
        postId: secondPostId,
        observedAt: START + day * DAY,
        receivedAt: Date.now(),
        views,
        sourceKey: `second:${day}`,
      });
    }
  });
  await fixture.settle(0);
  await t.run(
    async (ctx) =>
      await settleEarnings(ctx, {
        assignmentId: fixture.assignmentId,
        deliverableId: secondDeliverableId,
        periodIndex: 0,
      }),
  );
  expect(
    await t.run(async (ctx) => (await ctx.db.query("payouts").collect()).map((row) => row.amount)),
  ).toEqual([20_000, 20_000]);
});

test("a cap hit early prevents later payouts even without later metric evidence", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await fixture.snapshot(0, 0);
  vi.setSystemTime(START + 7 * DAY);
  await fixture.snapshot(7, 1000);
  await fixture.settle(0);
  vi.setSystemTime(START + 14 * DAY);
  expect(await fixture.settle(1)).toMatchObject({ status: "recorded", payoutIds: [] });
});

test("unverification holds variable earnings but preserves the already earned fixed amount", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await t.run(
    async (ctx) =>
      await ctx.db.patch("deliverableEarnings", fixture.earningsId, {
        variableHoldReason: "verification_changed",
      }),
  );
  await fixture.snapshot(0, 0);
  vi.setSystemTime(START + 7 * DAY);
  await fixture.snapshot(7, 100);
  const result = await fixture.settle(0);
  expect(result).toMatchObject({ status: "needsAttention", reason: "verification_changed" });
  expect(
    await t.run(async (ctx) => await ctx.db.get("payouts", result.payoutIds[0])),
  ).toMatchObject({ amount: 10_000 });
});

test("regressing metrics cannot be covered by a later period", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await fixture.snapshot(0, 50);
  vi.setSystemTime(START + 7 * DAY);
  await fixture.snapshot(7, 25);
  expect(await fixture.settle(0)).toMatchObject({
    status: "needsAttention",
    reason: "metric_count_regressed",
  });
  vi.setSystemTime(START + 14 * DAY);
  await fixture.snapshot(14, 500);
  expect(await fixture.settle(1)).toMatchObject({
    status: "needsAttention",
    reason: "earlier_period_unsettled",
  });
});

test("missing historical cancellation time and a cutoff before verification do not invent earnings", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  vi.setSystemTime(START + 7 * DAY);
  await t.run(
    async (ctx) => await ctx.db.patch("assignments", fixture.assignmentId, { status: "cancelled" }),
  );
  expect(await fixture.settle(0)).toMatchObject({
    status: "needsAttention",
    reason: "cancellation_time_missing",
  });
  await t.run(
    async (ctx) =>
      await ctx.db.patch("assignments", fixture.assignmentId, { cancelledAt: START - 1 }),
  );
  expect(await fixture.settle(0)).toMatchObject({
    status: "needsAttention",
    reason: "earning_timeline_invalid",
  });
  expect(await t.run(async (ctx) => await ctx.db.query("payouts").collect())).toHaveLength(0);
});

test("unknown legacy payout attribution blocks new amounts instead of ignoring old obligations", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  const oldPostId = await seedPost(t, fixture.assignmentId);
  await seedPayout(t, fixture.assignmentId, { postId: oldPostId });
  await t.run(async (ctx) => await ctx.db.delete("posts", oldPostId));
  vi.setSystemTime(START + 7 * DAY);
  expect(await fixture.settle(0)).toMatchObject({
    status: "needsAttention",
    reason: "legacy_obligation_unresolved",
    payoutIds: [],
  });
});

test("conflicting source keys fail without leaving a calculation or another obligation", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await fixture.snapshot(0, 0);
  vi.setSystemTime(START + 7 * DAY);
  await fixture.snapshot(7, 100);
  await seedPayout(t, fixture.assignmentId, {
    postId: fixture.postId,
    sourceKey: `earnings:${fixture.earningsId}:period:0:combined`,
    amount: 1,
  });
  await expectApiError(() => fixture.settle(0), "conflict", "payout_source_conflict");
  expect(await t.run(async (ctx) => await ctx.db.query("payouts").collect())).toHaveLength(1);
  expect(
    await t.run(async (ctx) => await ctx.db.query("earningCalculations").collect()),
  ).toHaveLength(0);
});

test("bounded accounting fails closed instead of summing only part of a large history", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await t.run(async (ctx) => {
    const assignment = (await ctx.db.get("assignments", fixture.assignmentId))!;
    for (let i = 0; i < 257; i++) {
      await ctx.db.insert("payouts", {
        assignmentId: assignment._id,
        deliverableId: fixture.deliverableId,
        postId: fixture.postId,
        creatorId: assignment.creatorId,
        companyId: assignment.companyId,
        campaignId: assignment.campaignId,
        sourceKey: `large:${i}`,
        amount: 1,
        currency: "usd",
        approvalStatus: "pending",
        paymentStatus: "notStarted",
        reviewRequestedAt: START,
        approvalDueAt: START + 3 * DAY,
      });
    }
  });
  vi.setSystemTime(START + 7 * DAY);
  expect(await fixture.settle(0)).toMatchObject({
    status: "needsAttention",
    reason: "obligation_history_too_large",
    payoutIds: [],
  });
});

test("a retroactive cutoff flags a recorded period even when it now lies outside the window", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await fixture.snapshot(0, 0);
  vi.setSystemTime(START + 7 * DAY);
  await fixture.snapshot(7, 100);
  await fixture.settle(0);
  vi.setSystemTime(START + 14 * DAY);
  await fixture.snapshot(14, 300);
  const second = await fixture.settle(1);
  const before = await t.run(async (ctx) => await ctx.db.query("payouts").collect());
  await t.run(
    async (ctx) =>
      await ctx.db.patch("deliverableEarnings", fixture.earningsId, {
        cutoffAt: START + 3 * DAY,
        cutoffReason: "removed",
      }),
  );
  const repeated = await fixture.settle(1);
  expect(repeated).toMatchObject({
    status: "needsAttention",
    reason: "earning_period_changed",
    payoutIds: second.payoutIds,
  });
  expect(await t.run(async (ctx) => await ctx.db.query("payouts").collect())).toEqual(before);
});

test("failure while saving calculation evidence rolls back the payout written in the same transaction", async () => {
  const t = convexTest(schema, modules);
  const fixture = await setup(t);
  await fixture.snapshot(0, 0);
  vi.setSystemTime(START + 7 * DAY);
  await fixture.snapshot(7, 100);
  await expect(
    t.run(async (ctx) => {
      const insert = ctx.db.insert.bind(ctx.db);
      const db = new Proxy(ctx.db, {
        get(target, property, receiver) {
          if (property === "insert") {
            return (...args: unknown[]) => {
              if (args[0] === "earningCalculations")
                throw new Error("simulated calculation write failure");
              return Reflect.apply(insert, ctx.db, args);
            };
          }
          return Reflect.get(target, property, receiver);
        },
      });
      return await settleEarnings(
        { ...ctx, db },
        {
          assignmentId: fixture.assignmentId,
          deliverableId: fixture.deliverableId,
          periodIndex: 0,
        },
      );
    }),
  ).rejects.toThrow("simulated calculation write failure");
  expect(await t.run(async (ctx) => await ctx.db.query("payouts").collect())).toHaveLength(0);
  expect(
    await t.run(async (ctx) => await ctx.db.query("earningCalculations").collect()),
  ).toHaveLength(0);
  expect((await fixture.settle(0)).payoutIds).toHaveLength(1);
});
