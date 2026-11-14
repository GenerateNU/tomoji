/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createPost, replacePost, unverifyPost, verifyPost } from "../../models/posts";
import { cancelAssignment } from "../../models/assignments";
import { settleEarnings } from "../../models/earnings";
import {
  initializePostEarnings,
  recordPostRemoval,
  recordPostViewSnapshot,
} from "../../models/earningSources";
import schema from "../../schema";
import {
  seedDeliverable,
  seedOneSubmission,
  seedPayout,
  seedSubmission,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
const START = Date.UTC(2026, 10, 11, 12);
const DAY = 86_400_000;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

async function fixturePost(t: TestConvex) {
  const { fixture, submissionId } = await seedOneSubmission(t, "approved");
  const postId = await t.run((ctx) =>
    createPost(ctx, fixture.creatorId, {
      submissionId,
      url: "https://x.com/creator/status/1843000000000000001",
    }),
  );
  return { fixture, postId };
}

async function verifiedFixture(t: TestConvex) {
  const setup = await fixturePost(t);
  await t.run((ctx) => verifyPost(ctx, setup.postId, { postedAt: START - DAY }));
  const earnings = (await t.run((ctx) => ctx.db.query("deliverableEarnings").take(2)))[0];
  const schedule = (await t.run((ctx) => ctx.db.query("earningsSchedules").take(2)))[0];
  return { ...setup, earnings, schedule };
}

test("only live verification creates a schedule, due seven days after verification", async () => {
  const t = convexTest(schema, modules);
  const { postId } = await fixturePost(t);
  expect(await t.run((ctx) => ctx.db.query("earningsSchedules").take(2))).toEqual([]);
  await t.run((ctx) => verifyPost(ctx, postId, { postedAt: START - DAY }));
  const schedules = await t.run((ctx) => ctx.db.query("earningsSchedules").take(2));
  expect(schedules).toHaveLength(1);
  expect(schedules[0]).toMatchObject({
    status: "scheduled",
    nextCheckAt: START + 7 * DAY,
    retryCount: 0,
  });
  expect(await t.run((ctx) => ctx.db.query("payouts").take(1))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("earningCalculations").take(1))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(1))).toEqual([]);
});

test("initialization retries, reverification, and replacement preserve schedule progress", async () => {
  const t = convexTest(schema, modules);
  const { fixture, postId, earnings, schedule } = await verifiedFixture(t);
  const progress = {
    nextCheckAt: START + 14 * DAY,
    lastAttemptedAt: START + 7 * DAY,
    lastAttemptedPeriodIndex: 0,
    retryCount: 2,
    lastError: "metric_evidence_missing",
  };
  await t.run((ctx) => ctx.db.patch("earningsSchedules", schedule._id, progress));
  vi.setSystemTime(START + 8 * DAY);
  await t.run((ctx) => initializePostEarnings(ctx, postId, Date.now()));
  await t.run((ctx) => unverifyPost(ctx, postId));
  await t.run((ctx) => verifyPost(ctx, postId, { postedAt: START - DAY }));
  await t.run((ctx) => unverifyPost(ctx, postId));
  const replacement = await t.run((ctx) =>
    replacePost(ctx, fixture.creatorId, postId, {
      url: "https://x.com/creator/status/1843000000000000002",
    }),
  );
  await t.run((ctx) => verifyPost(ctx, replacement._id, { postedAt: START }));
  expect(await t.run((ctx) => ctx.db.query("earningsSchedules").take(2))).toEqual([
    { ...schedule, ...progress },
  ]);
  expect(await t.run((ctx) => ctx.db.get("deliverableEarnings", earnings._id))).toEqual({
    ...earnings,
    variableHoldReason: "post_replaced",
  });
});

test("reverification repairs a missing schedule using the original earning clock", async () => {
  const t = convexTest(schema, modules);
  const { postId, earnings, schedule } = await verifiedFixture(t);
  await t.run((ctx) => ctx.db.delete("earningsSchedules", schedule._id));
  vi.setSystemTime(START + 9 * DAY);
  await t.run((ctx) => unverifyPost(ctx, postId));
  await t.run((ctx) => verifyPost(ctx, postId, { postedAt: START - DAY }));
  const schedules = await t.run((ctx) => ctx.db.query("earningsSchedules").take(2));
  expect(schedules).toHaveLength(1);
  expect(schedules[0]).toMatchObject({
    earningsId: earnings._id,
    nextCheckAt: START + 7 * DAY,
    retryCount: 0,
  });
});

test("cancellation records cutoffs and brings every deliverable forward without changing payouts", async () => {
  const t = convexTest(schema, modules);
  const { fixture, postId } = await verifiedFixture(t);
  const deliverableId = await seedDeliverable(t, fixture);
  const submissionId = await seedSubmission(t, { ...fixture, deliverableId }, "approved");
  const secondPostId = await t.run((ctx) =>
    createPost(ctx, fixture.creatorId, {
      submissionId,
      url: "https://x.com/creator/status/1843000000000000002",
    }),
  );
  await t.run((ctx) => verifyPost(ctx, secondPostId, { postedAt: START }));
  const payoutId = await seedPayout(t, fixture.assignmentId, { postId });
  const payout = await t.run((ctx) => ctx.db.get("payouts", payoutId));
  const agreements = await t.run((ctx) => ctx.db.query("deliverableEarnings").take(3));
  vi.setSystemTime(START + 3 * DAY);
  await t.run(async (ctx) =>
    cancelAssignment(ctx, (await ctx.db.get("assignments", fixture.assignmentId))!),
  );
  const schedules = await t.run((ctx) => ctx.db.query("earningsSchedules").take(3));
  expect(schedules).toHaveLength(2);
  expect(schedules.every((row) => row.nextCheckAt === START + 3 * DAY)).toBe(true);
  expect(await t.run((ctx) => ctx.db.query("deliverableEarnings").take(3))).toEqual(
    agreements.map((agreement) => ({
      ...agreement,
      cutoffAt: START + 3 * DAY,
      cutoffReason: "cancelled",
    })),
  );
  expect(await t.run((ctx) => ctx.db.query("payouts").take(2))).toEqual([payout]);
  expect(await t.run((ctx) => ctx.db.query("earningCalculations").take(1))).toEqual([]);
});

test("cancellation preserves an earlier outstanding check", async () => {
  const t = convexTest(schema, modules);
  const { fixture, schedule } = await verifiedFixture(t);
  vi.setSystemTime(START + 10 * DAY);
  await t.run(async (ctx) =>
    cancelAssignment(ctx, (await ctx.db.get("assignments", fixture.assignmentId))!),
  );
  expect(await t.run((ctx) => ctx.db.get("earningsSchedules", schedule._id))).toEqual(schedule);
});

test("cancellation wakes a completed schedule while preserving attempt history", async () => {
  const t = convexTest(schema, modules);
  const { fixture, schedule } = await verifiedFixture(t);
  const history = { lastAttemptedAt: START + DAY, lastAttemptedPeriodIndex: 0, retryCount: 2 };
  await t.run((ctx) =>
    ctx.db.patch("earningsSchedules", schedule._id, {
      status: "complete",
      nextCheckAt: undefined,
      ...history,
    }),
  );
  vi.setSystemTime(START + 3 * DAY);
  await t.run(async (ctx) =>
    cancelAssignment(ctx, (await ctx.db.get("assignments", fixture.assignmentId))!),
  );
  expect(await t.run((ctx) => ctx.db.get("earningsSchedules", schedule._id))).toMatchObject({
    status: "scheduled",
    nextCheckAt: START + 3 * DAY,
    ...history,
  });
});

test("delayed removal wakes a completed schedule at the actual cutoff and retries are inert", async () => {
  const t = convexTest(schema, modules);
  const { postId, earnings, schedule } = await verifiedFixture(t);
  await t.run((ctx) =>
    ctx.db.patch("earningsSchedules", schedule._id, { status: "complete", nextCheckAt: undefined }),
  );
  vi.setSystemTime(START + 12 * DAY);
  const evidence = { postId, removedAt: START + 3 * DAY, sourceKey: "removed:1" };
  await t.run((ctx) => recordPostRemoval(ctx, evidence));
  expect(await t.run((ctx) => ctx.db.get("earningsSchedules", schedule._id))).toMatchObject({
    status: "scheduled",
    nextCheckAt: START + 3 * DAY,
  });
  expect(await t.run((ctx) => ctx.db.get("deliverableEarnings", earnings._id))).toEqual({
    ...earnings,
    cutoffAt: START + 3 * DAY,
    cutoffReason: "removed",
  });
  await t.run((ctx) =>
    ctx.db.patch("earningsSchedules", schedule._id, { status: "complete", nextCheckAt: undefined }),
  );
  const complete = await t.run((ctx) => ctx.db.get("earningsSchedules", schedule._id));
  await t.run((ctx) => recordPostRemoval(ctx, evidence));
  expect(await t.run((ctx) => ctx.db.get("earningsSchedules", schedule._id))).toEqual(complete);
  expect(await t.run((ctx) => ctx.db.query("payouts").take(1))).toEqual([]);
});

test.each(["cancelled", "removed"] as const)(
  "verification after a known %s cutoff cannot initialize an earning agreement",
  async (cutoff) => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await fixturePost(t);
    if (cutoff === "cancelled") {
      await t.run(async (ctx) =>
        cancelAssignment(ctx, (await ctx.db.get("assignments", fixture.assignmentId))!),
      );
    } else {
      await t.run((ctx) =>
        recordPostRemoval(ctx, { postId, removedAt: START, sourceKey: "removed:before-verify" }),
      );
    }
    vi.setSystemTime(START + DAY);
    await expect(
      t.run((ctx) => verifyPost(ctx, postId, { postedAt: START - DAY })),
    ).rejects.toMatchObject({
      data: {
        code: "invalid_state",
        reason: cutoff === "cancelled" ? "assignment_not_active" : "post_removed",
      },
    });
    expect(await t.run((ctx) => ctx.db.query("deliverableEarnings").take(1))).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("earningsSchedules").take(1))).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("payouts").take(1))).toEqual([]);
  },
);

test("late pre-verification removal parks work without cancelling the fixed-fee obligation", async () => {
  const t = convexTest(schema, modules);
  const { fixture, postId, schedule } = await verifiedFixture(t);
  vi.setSystemTime(START + 7 * DAY);
  const settlement = await t.run((ctx) =>
    settleEarnings(ctx, {
      assignmentId: fixture.assignmentId,
      deliverableId: fixture.deliverableId,
      periodIndex: 0,
    }),
  );
  expect(settlement.status).toBe("pendingMetrics");
  const payouts = await t.run((ctx) => ctx.db.query("payouts").take(2));
  expect(payouts).toHaveLength(1);
  expect(payouts[0]).toMatchObject({
    amount: 10_000,
    approvalStatus: "pending",
    approvalDueAt: START + 10 * DAY,
  });
  const calculations = await t.run((ctx) => ctx.db.query("earningCalculations").take(3));

  vi.setSystemTime(START + 8 * DAY);
  const removal = { postId, removedAt: START - 1, sourceKey: "removed:late-before-verify" };
  await t.run((ctx) => recordPostRemoval(ctx, removal));
  const parked = await t.run((ctx) => ctx.db.get("earningsSchedules", schedule._id));
  expect(parked).toMatchObject({
    status: "needsAttention",
    lastError: "cutoff_precedes_verification",
  });
  expect(parked?.nextCheckAt).toBeUndefined();
  await t.run((ctx) => recordPostRemoval(ctx, removal));
  expect(await t.run((ctx) => ctx.db.get("earningsSchedules", schedule._id))).toEqual(parked);
  expect(await t.run((ctx) => ctx.db.query("payouts").take(2))).toEqual(payouts);
  expect(await t.run((ctx) => ctx.db.query("earningCalculations").take(3))).toEqual(calculations);
});

test("removal at verification schedules the earned fixed fee immediately", async () => {
  const t = convexTest(schema, modules);
  const { fixture, postId, schedule } = await verifiedFixture(t);
  await t.run((ctx) =>
    recordPostRemoval(ctx, { postId, removedAt: START, sourceKey: "removed:at-verify" }),
  );
  expect(await t.run((ctx) => ctx.db.get("earningsSchedules", schedule._id))).toMatchObject({
    status: "scheduled",
    nextCheckAt: START,
  });
  const settlement = await t.run((ctx) =>
    settleEarnings(ctx, {
      assignmentId: fixture.assignmentId,
      deliverableId: fixture.deliverableId,
      periodIndex: 0,
    }),
  );
  expect(settlement.status).toBe("recorded");
  const payouts = await t.run((ctx) => ctx.db.query("payouts").take(2));
  expect(payouts).toHaveLength(1);
  expect(payouts[0]).toMatchObject({ amount: 10_000, approvalDueAt: START + 3 * DAY });
});

test("a removal retry wakes a parked schedule only when it clears an obsolete hold", async () => {
  const t = convexTest(schema, modules);
  const { postId, earnings, schedule } = await verifiedFixture(t);
  vi.setSystemTime(START + 5 * DAY);
  for (const [day, views] of [
    [0, 0],
    [3, 100],
    [4, 300],
    [5, 250],
  ]) {
    await t.run((ctx) =>
      recordPostViewSnapshot(ctx, {
        postId,
        observedAt: START + day * DAY,
        views,
        sourceKey: `view:${day}`,
      }),
    );
  }
  const evidence = { postId, removedAt: START + 3 * DAY, sourceKey: "removed:1" };
  // State left when an earlier removal persisted its cutoff but kept the regression hold.
  await t.run(async (ctx) => {
    await ctx.db.patch("posts", postId, {
      removedAt: evidence.removedAt,
      removalSourceKey: evidence.sourceKey,
    });
    await ctx.db.patch("deliverableEarnings", earnings._id, {
      cutoffAt: evidence.removedAt,
      cutoffReason: "removed",
    });
    await ctx.db.patch("earningsSchedules", schedule._id, {
      status: "needsAttention",
      nextCheckAt: undefined,
      lastError: "metric_count_regressed",
    });
  });
  await t.run((ctx) => recordPostRemoval(ctx, evidence));
  expect(await t.run((ctx) => ctx.db.get("deliverableEarnings", earnings._id))).not.toHaveProperty(
    "variableHoldReason",
  );
  expect(await t.run((ctx) => ctx.db.get("earningsSchedules", schedule._id))).toMatchObject({
    status: "scheduled",
    nextCheckAt: evidence.removedAt,
  });
  await t.run((ctx) =>
    ctx.db.patch("earningsSchedules", schedule._id, {
      status: "complete",
      nextCheckAt: undefined,
      lastAttemptedPeriodIndex: 0,
    }),
  );
  const completed = await t.run((ctx) => ctx.db.get("earningsSchedules", schedule._id));
  await t.run((ctx) => recordPostRemoval(ctx, evidence));
  expect(await t.run((ctx) => ctx.db.get("earningsSchedules", schedule._id))).toEqual(completed);
});

test("an already-unverified legacy post cannot create a schedule through reverification", async () => {
  const t = convexTest(schema, modules);
  const { postId } = await fixturePost(t);
  await t.run((ctx) => ctx.db.patch("posts", postId, { earningsTrackingVersion: undefined }));
  const verified = await t.run((ctx) => verifyPost(ctx, postId, { postedAt: START - DAY }));
  expect(verified.earningsTimingUnknown).toBe(true);
  expect(await t.run((ctx) => ctx.db.query("deliverableEarnings").take(1))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("earningsSchedules").take(1))).toEqual([]);
});

test("removing a replacement post does not change the original agreement's schedule", async () => {
  const t = convexTest(schema, modules);
  const { fixture, postId, schedule } = await verifiedFixture(t);
  await t.run((ctx) => unverifyPost(ctx, postId));
  const replacement = await t.run((ctx) =>
    replacePost(ctx, fixture.creatorId, postId, {
      url: "https://x.com/creator/status/1843000000000000002",
    }),
  );
  vi.setSystemTime(START + DAY);
  await t.run((ctx) =>
    recordPostRemoval(ctx, { postId: replacement._id, removedAt: Date.now(), sourceKey: "new:1" }),
  );
  expect(await t.run((ctx) => ctx.db.get("earningsSchedules", schedule._id))).toEqual(schedule);
});

test("legacy verification without a known start does not invent a schedule", async () => {
  const t = convexTest(schema, modules);
  const { postId } = await fixturePost(t);
  await t.run((ctx) =>
    ctx.db.patch("posts", postId, {
      isVerified: true,
      postedAt: START - DAY,
      earningsTrackingVersion: undefined,
    }),
  );
  await t.run((ctx) => unverifyPost(ctx, postId));
  vi.setSystemTime(START + DAY);
  await t.run((ctx) => verifyPost(ctx, postId, { postedAt: START - DAY }));
  expect(await t.run((ctx) => ctx.db.query("deliverableEarnings").take(1))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query("earningsSchedules").take(1))).toEqual([]);
});

test("corrupt excess agreements roll cancellation back without partially waking schedules", async () => {
  const t = convexTest(schema, modules);
  const { fixture, earnings, schedule } = await verifiedFixture(t);
  const assignment = (await t.run((ctx) => ctx.db.get("assignments", fixture.assignmentId)))!;
  const opportunity = await t.run((ctx) => ctx.db.get("opportunities", assignment.opportunityId));
  await t.run(async (ctx) => {
    // Imported duplicate agreements exceed the opportunity's maximum of 20 deliverables.
    for (let index = 0; index < 20; index++) {
      await ctx.db.insert("deliverableEarnings", {
        assignmentId: earnings.assignmentId,
        deliverableId: earnings.deliverableId,
        postId: earnings.postId,
        creatorId: earnings.creatorId,
        companyId: earnings.companyId,
        campaignId: earnings.campaignId,
        fixedFeeCents: earnings.fixedFeeCents,
        cpmRateCents: earnings.cpmRateCents,
        paymentCapCents: earnings.paymentCapCents,
        currency: earnings.currency,
        policyVersion: earnings.policyVersion,
        startedAt: earnings.startedAt,
        endsAt: earnings.endsAt,
      });
    }
  });
  vi.setSystemTime(START + 3 * DAY);
  await expect(t.run((ctx) => cancelAssignment(ctx, assignment))).rejects.toMatchObject({
    data: { code: "conflict", reason: "earning_agreement_assignment_limit" },
  });
  expect(await t.run((ctx) => ctx.db.get("assignments", fixture.assignmentId))).toEqual(assignment);
  expect(await t.run((ctx) => ctx.db.get("opportunities", assignment.opportunityId))).toEqual(
    opportunity,
  );
  expect(await t.run((ctx) => ctx.db.query("earningsSchedules").take(2))).toEqual([schedule]);
});
