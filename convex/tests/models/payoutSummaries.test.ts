/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { getPayoutSummary, listPayoutPeriods } from "../../models/payoutSummaries";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignmentFixture,
  seedCreatorId,
  seedPayout,
  seedPost,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const DAY = 86_400_000;
// The caller's local start of this month and of last month.
const FROM = Date.UTC(2026, 10, 1);
const PREVIOUS_FROM = Date.UTC(2026, 9, 1);

async function setup() {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  return { t, fixture, creatorId: fixture.creatorId };
}

function seedAttempt(
  t: TestConvex,
  payoutId: Id<"payouts">,
  fields: {
    status: "processing" | "succeeded" | "failed";
    stripeFee?: number;
    creatorNet?: number;
  },
  attempt = 1,
) {
  return t.run((ctx) =>
    ctx.db.insert("payments", {
      payoutId,
      attempt,
      stripeAccountId: "acct_creator",
      ...fields,
      ...(fields.stripeFee === undefined ? {} : { settlementCurrency: "usd" }),
    }),
  );
}

describe("getPayoutSummary", () => {
  test("totals the creator's earnings since `from`, ignoring older ones", async () => {
    const { t, fixture, creatorId } = await setup();
    await seedPayout(t, fixture.assignmentId, { amount: 1_000, reviewRequestedAt: FROM + DAY });
    await seedPayout(t, fixture.assignmentId, { amount: 2_500, reviewRequestedAt: FROM + 2 * DAY });
    await seedPayout(t, fixture.assignmentId, { amount: 9_999, reviewRequestedAt: FROM - DAY });

    const summary = await t.run((ctx) =>
      getPayoutSummary(ctx, creatorId, { from: FROM, previousFrom: null }),
    );

    expect(summary.total).toBe(3_500);
    expect(summary.previousTotal).toBeNull();
    // Oldest first, so the chart can accumulate them.
    expect(summary.earnings).toEqual([
      { at: FROM + DAY, amount: 1_000 },
      { at: FROM + 2 * DAY, amount: 2_500 },
    ]);
    expect(summary.isPartial).toBe(false);
  });

  // The previous period is what the percentage change compares against.
  test("totals the previous period separately", async () => {
    const { t, fixture, creatorId } = await setup();
    await seedPayout(t, fixture.assignmentId, { amount: 3_000, reviewRequestedAt: FROM + DAY });
    await seedPayout(t, fixture.assignmentId, { amount: 1_000, reviewRequestedAt: FROM - DAY });
    await seedPayout(t, fixture.assignmentId, {
      amount: 500,
      reviewRequestedAt: PREVIOUS_FROM - DAY,
    });

    const summary = await t.run((ctx) =>
      getPayoutSummary(ctx, creatorId, { from: FROM, previousFrom: PREVIOUS_FROM }),
    );

    expect(summary.total).toBe(3_000);
    expect(summary.previousTotal).toBe(1_000);
  });

  test("includes everything when there is no `from`", async () => {
    const { t, fixture, creatorId } = await setup();
    await seedPayout(t, fixture.assignmentId, { amount: 1_000, reviewRequestedAt: 1_000 });
    await seedPayout(t, fixture.assignmentId, { amount: 2_000, reviewRequestedAt: FROM });

    const summary = await t.run((ctx) =>
      getPayoutSummary(ctx, creatorId, { from: null, previousFrom: null }),
    );

    expect(summary.total).toBe(3_000);
    expect(summary.previousTotal).toBeNull();
  });

  test("ranks posts by what they earned, with last period's amount", async () => {
    const { t, fixture, creatorId } = await setup();
    const best = await seedPost(t, fixture.assignmentId);
    const second = await seedPost(t, fixture.assignmentId);
    for (const [postId, amount, at] of [
      [best, 4_000, FROM + DAY],
      [best, 1_000, FROM + 2 * DAY],
      [second, 3_000, FROM + DAY],
      [best, 2_000, FROM - DAY],
    ] as const) {
      await seedPayout(t, fixture.assignmentId, { postId, amount, reviewRequestedAt: at });
    }

    const { topPosts } = await t.run((ctx) =>
      getPayoutSummary(ctx, creatorId, { from: FROM, previousFrom: PREVIOUS_FROM }),
    );

    expect(topPosts).toEqual([
      {
        postId: best,
        url: expect.stringContaining("https://x.com/"),
        amount: 5_000,
        previousAmount: 2_000,
      },
      {
        postId: second,
        url: expect.stringContaining("https://x.com/"),
        amount: 3_000,
        previousAmount: 0,
      },
    ]);
  });

  test("keeps at most six top posts", async () => {
    const { t, fixture, creatorId } = await setup();
    for (let i = 0; i < 7; i++) {
      await seedPayout(t, fixture.assignmentId, { amount: 100 * (i + 1), reviewRequestedAt: FROM });
    }

    const { topPosts } = await t.run((ctx) =>
      getPayoutSummary(ctx, creatorId, { from: FROM, previousFrom: null }),
    );

    expect(topPosts.map((post) => post.amount)).toEqual([700, 600, 500, 400, 300, 200]);
  });

  // A deleted post still earned the money; it just can't be opened.
  test("lists a deleted post without a link", async () => {
    const { t, fixture, creatorId } = await setup();
    const payoutId = await seedPayout(t, fixture.assignmentId, { reviewRequestedAt: FROM });
    const payout = await t.run((ctx) => ctx.db.get("payouts", payoutId));
    await t.run((ctx) => ctx.db.delete("posts", payout!.postId));

    const { topPosts } = await t.run((ctx) =>
      getPayoutSummary(ctx, creatorId, { from: FROM, previousFrom: null }),
    );

    expect(topPosts[0].url).toBeNull();
  });

  test("leaves out other creators' payouts", async () => {
    const { t, fixture, creatorId } = await setup();
    const otherCreatorId = await seedCreatorId(t, "other_creator");
    await seedPayout(t, fixture.assignmentId, {
      creatorId: otherCreatorId,
      reviewRequestedAt: FROM,
    });

    const summary = await t.run((ctx) =>
      getPayoutSummary(ctx, creatorId, { from: FROM, previousFrom: null }),
    );

    expect(summary.total).toBe(0);
    expect(summary.topPosts).toEqual([]);
  });

  test("refuses a previous period that doesn't end where this one starts", async () => {
    const { t, creatorId } = await setup();

    await expectApiError(
      () => t.run((ctx) => getPayoutSummary(ctx, creatorId, { from: FROM, previousFrom: FROM })),
      "invalid_state",
      "summary_range_invalid",
    );
    await expectApiError(
      () => t.run((ctx) => getPayoutSummary(ctx, creatorId, { from: null, previousFrom: FROM })),
      "invalid_state",
      "summary_range_invalid",
    );
  });
});

describe("listPayoutPeriods", () => {
  const week = { startsAt: Date.UTC(2026, 9, 31), endsAt: Date.UTC(2026, 10, 7) };
  const earlierWeek = { startsAt: Date.UTC(2026, 9, 24), endsAt: Date.UTC(2026, 9, 31) };

  test("groups payouts by earning period, newest first", async () => {
    const { t, fixture, creatorId } = await setup();
    await seedPayout(t, fixture.assignmentId, { amount: 1_000, earningPeriod: earlierWeek });
    await seedPayout(t, fixture.assignmentId, { amount: 2_000, earningPeriod: week });
    await seedPayout(t, fixture.assignmentId, { amount: 500, earningPeriod: week });

    const { periods, isPartial } = await t.run((ctx) => listPayoutPeriods(ctx, creatorId));

    expect(
      periods.map((period) => [period.earningPeriod, period.amount, period.postCount]),
    ).toEqual([
      [week, 2_500, 2],
      [earlierWeek, 1_000, 1],
    ]);
    expect(isPartial).toBe(false);
  });

  test("counts a post earning twice in a period once", async () => {
    const { t, fixture, creatorId } = await setup();
    const postId = await seedPost(t, fixture.assignmentId);
    await seedPayout(t, fixture.assignmentId, { postId, earningPeriod: week });
    await seedPayout(t, fixture.assignmentId, { postId, earningPeriod: week });

    const { periods } = await t.run((ctx) => listPayoutPeriods(ctx, creatorId));

    expect(periods[0].postCount).toBe(1);
  });

  // A fixed fee has no earning period, so it is its own row dated when it was earned.
  test("lists a payout without an earning period on its own", async () => {
    const { t, fixture, creatorId } = await setup();
    await seedPayout(t, fixture.assignmentId, { amount: 3_000, reviewRequestedAt: FROM });
    await seedPayout(t, fixture.assignmentId, { amount: 4_000, reviewRequestedAt: FROM });

    const { periods } = await t.run((ctx) => listPayoutPeriods(ctx, creatorId));

    expect(periods).toHaveLength(2);
    expect(periods[0]).toMatchObject({ earningPeriod: null, earnedAt: FROM });
  });

  test("dates a period by its last approval once every payout is approved", async () => {
    const { t, fixture, creatorId } = await setup();
    const approved = { approvalStatus: "approved", approvalSource: "automatic" } as const;
    await seedPayout(t, fixture.assignmentId, {
      ...approved,
      approvedAt: 2_000,
      earningPeriod: week,
    });
    await seedPayout(t, fixture.assignmentId, {
      ...approved,
      approvedAt: 3_000,
      earningPeriod: week,
    });
    await seedPayout(t, fixture.assignmentId, {
      ...approved,
      approvedAt: 1_000,
      earningPeriod: earlierWeek,
    });
    await seedPayout(t, fixture.assignmentId, { earningPeriod: earlierWeek });

    const { periods } = await t.run((ctx) => listPayoutPeriods(ctx, creatorId));

    expect(periods.map((period) => period.approvedAt)).toEqual([3_000, null]);
  });

  // Fee and net are what Stripe reported for the charge that paid each payout.
  test("adds up what was paid out and Stripe's fees", async () => {
    const { t, fixture, creatorId } = await setup();
    const paid = await seedPayout(t, fixture.assignmentId, {
      amount: 1_000,
      paymentStatus: "transferred",
      earningPeriod: week,
    });
    await seedAttempt(t, paid, { status: "failed" }, 1);
    await seedAttempt(t, paid, { status: "succeeded", stripeFee: 59, creatorNet: 941 }, 2);
    const alsoPaid = await seedPayout(t, fixture.assignmentId, {
      amount: 2_000,
      paymentStatus: "transferred",
      earningPeriod: week,
    });
    await seedAttempt(t, alsoPaid, { status: "succeeded", stripeFee: 88, creatorNet: 1_912 });
    await seedPayout(t, fixture.assignmentId, {
      amount: 500,
      paymentStatus: "queued",
      earningPeriod: week,
    });

    const { periods } = await t.run((ctx) => listPayoutPeriods(ctx, creatorId));

    expect(periods[0]).toMatchObject({
      amount: 3_500,
      cleared: 3_000,
      settlements: [{ currency: "usd", stripeFee: 147, creatorNet: 2_853 }],
    });
  });

  // Stripe attaches the fee a few seconds after the charge succeeds.
  test("leaves out a charge whose fee hasn't arrived yet", async () => {
    const { t, fixture, creatorId } = await setup();
    const paid = await seedPayout(t, fixture.assignmentId, {
      paymentStatus: "transferred",
      earningPeriod: week,
    });
    await seedAttempt(t, paid, { status: "succeeded" });

    const { periods } = await t.run((ctx) => listPayoutPeriods(ctx, creatorId));

    expect(periods[0].cleared).toBe(10_000);
    expect(periods[0].settlements).toEqual([]);
  });

  test("leaves out other creators' payouts", async () => {
    const { t, fixture, creatorId } = await setup();
    const otherCreatorId = await seedCreatorId(t, "other_creator");
    await seedPayout(t, fixture.assignmentId, { creatorId: otherCreatorId, earningPeriod: week });

    expect((await t.run((ctx) => listPayoutPeriods(ctx, creatorId))).periods).toEqual([]);
  });
});
