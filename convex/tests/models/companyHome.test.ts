/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  getCompanyDrafts,
  getCompanyEarnings,
  getCompanyOffers,
  getCompanyOverview,
} from "../../models/companyHome";
import schema from "../../schema";
import {
  DAY,
  campaignArgs,
  expectApiError,
  seedAiReviewFixture,
  seedAssignment,
  seedAssignmentFixture,
  seedCampaign,
  seedDispute,
  seedDeliverable,
  seedPayout,
  seedPost,
  seedSubmission,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
const from = Date.UTC(2026, 10, 1);
const range = { from, to: from + 7 * DAY };
afterEach(() => vi.unstubAllEnvs());

describe("getCompanyOverview", () => {
  test("returns zero totals for a company with no activity", async () => {
    const t = convexTest(schema, modules);
    const { membership } = await seedCampaign(t, { subject: "home", status: "draft" });

    const overview = await t.run((ctx) => getCompanyOverview(ctx, membership.companyId, range));

    expect(overview.liveCampaigns).toEqual({ value: 0, capped: false });
    expect(overview.spend).toEqual({ amounts: [], campaignCount: 0, isPartial: false });
    expect(overview.performance).toEqual({
      views: 0,
      history: [],
      postsWithoutMetrics: 0,
      isPartial: false,
    });
  });

  test("isolates campaigns and paid spend, using transfer time and separate currencies", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const foreign = await seedCampaign(t, { subject: "foreign", orgId: "org_foreign" });
    await seedPayout(t, fixture.assignmentId, {
      amount: 1_000,
      reviewRequestedAt: from - DAY,
      transferredAt: from,
      paymentStatus: "transferred",
      currency: "usd",
    });
    await seedPayout(t, fixture.assignmentId, {
      amount: 2_000,
      transferredAt: range.to - 1,
      paymentStatus: "transferred",
      currency: "eur",
    });
    await seedPayout(t, fixture.assignmentId, { amount: 9_999, reviewRequestedAt: from });
    await seedPayout(t, fixture.assignmentId, {
      transferredAt: range.to,
      paymentStatus: "transferred",
    });
    await seedPayout(t, fixture.assignmentId, {
      transferredAt: from - 1,
      paymentStatus: "transferred",
    });
    await seedPayout(t, fixture.assignmentId, {
      companyId: foreign.membership.companyId,
      campaignId: foreign.campaignId,
      transferredAt: from,
      paymentStatus: "transferred",
    });

    const overview = await t.run((ctx) =>
      getCompanyOverview(ctx, fixture.membership.companyId, range),
    );

    expect(overview.liveCampaigns).toEqual({ value: 1, capped: false });
    expect(overview.spend).toEqual({
      amounts: [
        { currency: "eur", amount: 2_000 },
        { currency: "usd", amount: 1_000 },
      ],
      campaignCount: 1,
      isPartial: false,
    });
  });

  test("uses real observations for the chart and excludes unverified and inactive posts", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const postId = await seedPost(t, fixture.assignmentId);
    const inactive = await seedPost(t, fixture.assignmentId);
    const unverified = await seedPost(t, fixture.assignmentId);
    await t.run(async (ctx) => {
      await ctx.db.patch("posts", postId, { views: 300 });
      await ctx.db.patch("posts", inactive, { isActive: false, views: 9_999 });
      await ctx.db.patch("posts", unverified, { isVerified: false, views: 9_999 });
      for (const [observedAt, views] of [
        [from - 1, 100],
        [from + DAY, 200],
        [range.to, 300],
      ]) {
        await ctx.db.insert("postViewSnapshots", {
          postId,
          observedAt,
          views,
          sourceKey: String(observedAt),
          receivedAt: observedAt,
        });
      }
    });

    const { performance } = await t.run((ctx) =>
      getCompanyOverview(ctx, fixture.membership.companyId, range),
    );

    expect(performance).toEqual({
      views: 300,
      postsWithoutMetrics: 0,
      isPartial: false,
      history: [
        { at: from, views: 100 },
        { at: from + DAY, views: 200 },
      ],
    });
  });

  test("does not turn missing metrics or missing historical baselines into zero views", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const postId = await seedPost(t, fixture.assignmentId);
    await t.run((ctx) =>
      ctx.db.insert("postViewSnapshots", {
        postId,
        observedAt: from + DAY,
        views: 20,
        sourceKey: "first",
        receivedAt: from + DAY,
      }),
    );

    const { performance } = await t.run((ctx) =>
      getCompanyOverview(ctx, fixture.membership.companyId, range),
    );

    expect(performance.views).toBeNull();
    expect(performance.postsWithoutMetrics).toBe(1);
    expect(performance.history).toEqual([
      { at: from, views: null },
      { at: from + DAY, views: 20 },
    ]);
  });

  test("adds observations across posts without double counting earlier observations", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const posts = [
      await seedPost(t, fixture.assignmentId),
      await seedPost(t, fixture.assignmentId),
    ];
    await t.run(async (ctx) => {
      for (const postId of posts) {
        await ctx.db.patch("posts", postId, { views: 20 });
        for (const [observedAt, views] of [
          [from, 10],
          [from + DAY, 20],
        ]) {
          await ctx.db.insert("postViewSnapshots", {
            postId,
            observedAt,
            views,
            sourceKey: String(observedAt),
            receivedAt: observedAt,
          });
        }
      }
    });

    const { performance } = await t.run((ctx) =>
      getCompanyOverview(ctx, fixture.membership.companyId, range),
    );

    expect(performance.views).toBe(40);
    expect(performance.history).toEqual([
      { at: from, views: 20 },
      { at: from + DAY, views: 40 },
    ]);
  });

  test("marks truncated campaign history as partial", async () => {
    const t = convexTest(schema, modules);
    const { membership, campaignId } = await seedCampaign(t, { subject: "bulk" });
    await t.run(async (ctx) => {
      const campaign = await ctx.db.get("campaigns", campaignId);
      if (!campaign) throw new Error("expected campaign");
      for (let index = 0; index < 100; index++)
        await ctx.db.insert("campaigns", {
          ...campaignArgs(),
          companyId: membership.companyId,
          createdBy: membership._id,
        });
    });

    const overview = await t.run((ctx) => getCompanyOverview(ctx, membership.companyId, range));
    expect(overview.performance.isPartial).toBe(true);
    expect(overview.liveCampaigns.value).toBe(101);
  });

  test("rejects invalid periods", async () => {
    const t = convexTest(schema, modules);
    const { membership } = await seedCampaign(t, { subject: "range" });
    for (const invalid of [
      { from: -1, to: 1 },
      { from, to: from },
      { from, to: from + 32 * DAY },
      { from: NaN, to: from + DAY },
      { from, to: Infinity },
      { from: from + 0.5, to: from + DAY },
    ]) {
      await expectApiError(
        () => t.run((ctx) => getCompanyOverview(ctx, membership.companyId, invalid)),
        "invalid_state",
        "summary_range_invalid",
      );
    }
  });
});

describe("getCompanyOffers", () => {
  test("counts only the company's unexpired offers and returns offers by soonest expiry", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const foreign = await seedCampaign(t, { subject: "foreign", orgId: "org_foreign" });
    const now = Date.now();
    await t.run(async (ctx) => {
      const assignment = await ctx.db.get("assignments", fixture.assignmentId);
      if (!assignment) throw new Error("expected assignment");
      const fields = {
        companyId: fixture.membership.companyId,
        creatorId: fixture.creatorId,
        opportunityId: assignment.opportunityId,
        status: "offered" as const,
      };
      for (let index = 7; index > 0; index--) {
        await ctx.db.insert("applications", { ...fields, offerExpiresAt: now + index * DAY });
      }
      await ctx.db.insert("applications", { ...fields, offerExpiresAt: now });
      await ctx.db.insert("applications", {
        ...fields,
        status: "accepted",
        offerExpiresAt: now + DAY,
      });
      await ctx.db.insert("applications", {
        ...fields,
        companyId: foreign.membership.companyId,
        offerExpiresAt: now + DAY,
      });
    });

    const offers = await t.run((ctx) => getCompanyOffers(ctx, fixture.membership.companyId, now));

    expect(offers.count).toBe(7);
    expect(offers.rows.map((row) => row.expiresAt)).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map((n) => now + n * DAY),
    );
    expect(offers.isPartial).toBe(false);
  });

  test("marks capped offers and rejects invalid display times", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await t.run(async (ctx) => {
      const assignment = await ctx.db.get("assignments", fixture.assignmentId);
      if (!assignment) throw new Error("expected assignment");
      for (let index = 0; index < 101; index++)
        await ctx.db.insert("applications", {
          companyId: fixture.membership.companyId,
          creatorId: fixture.creatorId,
          opportunityId: assignment.opportunityId,
          status: "offered",
          offerExpiresAt: range.to,
        });
    });
    const offers = await t.run((ctx) => getCompanyOffers(ctx, fixture.membership.companyId, from));
    expect(offers).toMatchObject({ count: 100, isPartial: true });
    expect(offers.rows).toHaveLength(100);
    expect(
      (await t.run((ctx) => getCompanyOffers(ctx, fixture.membership.companyId, range.to))).count,
    ).toBe(0);
    await expectApiError(
      () => t.run((ctx) => getCompanyOffers(ctx, fixture.membership.companyId, NaN)),
      "invalid_state",
      "summary_range_invalid",
    );
  });
});

describe("getCompanyDrafts", () => {
  test("returns four newest previews while keeping the full reviewable count", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const ids = [];
    for (let index = 0; index < 5; index++) {
      const deliverableId = await seedDeliverable(t, fixture);
      ids.push(await seedSubmission(t, { ...fixture, deliverableId }, "pending"));
    }
    const drafts = await t.run((ctx) => getCompanyDrafts(ctx, fixture.membership.companyId));
    expect(drafts.count).toBe(5);
    expect(drafts.rows.map((row) => row.submissionId)).toEqual(ids.reverse().slice(0, 4));
  });

  test("shows only the latest pending draft per deliverable on active company assignments", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await seedSubmission(t, fixture, "changesRequested");
    const latest = await seedSubmission(t, fixture, "pending");
    const foreign = await seedCampaign(t, { subject: "foreign", orgId: "org_foreign" });

    expect(await t.run((ctx) => getCompanyDrafts(ctx, fixture.membership.companyId))).toMatchObject(
      {
        count: 1,
        rows: [{ submissionId: latest, mediaId: fixture.mediaId }],
        isPartial: false,
      },
    );
    expect(await t.run((ctx) => getCompanyDrafts(ctx, foreign.membership.companyId))).toEqual({
      count: 0,
      rows: [],
      isPartial: false,
    });
    await t.run((ctx) =>
      ctx.db.patch("assignments", fixture.assignmentId, { status: "cancelled" }),
    );
    expect((await t.run((ctx) => getCompanyDrafts(ctx, fixture.membership.companyId))).count).toBe(
      0,
    );
  });

  test("waits for Jev to hand off a running review, but allows manual review when AI is disabled", async () => {
    vi.stubEnv("AI_REVIEW_ENABLED", "false");
    const t = convexTest(schema, modules);
    const fixture = await seedAiReviewFixture(t);
    vi.stubEnv("AI_REVIEW_ENABLED", "true");
    await t.run((ctx) =>
      ctx.db.patch("aiReviewAttempts", fixture.attempt._id, {
        status: "evaluating",
        workflowId: "workflow-home",
      }),
    );
    expect((await t.run((ctx) => getCompanyDrafts(ctx, fixture.membership.companyId))).count).toBe(
      0,
    );
    await t.run((ctx) =>
      ctx.db.patch("aiReviewAttempts", fixture.attempt._id, { status: "manualReview" }),
    );
    expect((await t.run((ctx) => getCompanyDrafts(ctx, fixture.membership.companyId))).count).toBe(
      1,
    );
    await t.run((ctx) =>
      ctx.db.patch("aiReviewAttempts", fixture.attempt._id, { status: "evaluating" }),
    );
    vi.stubEnv("AI_REVIEW_ENABLED", "false");
    expect((await t.run((ctx) => getCompanyDrafts(ctx, fixture.membership.companyId))).count).toBe(
      1,
    );
  });
});

describe("getCompanyEarnings", () => {
  test("uses approval time for period totals across request-date boundaries", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await seedPayout(t, fixture.assignmentId, {
      amount: 1_000,
      approvalStatus: "approved",
      reviewRequestedAt: from - DAY,
      approvedAt: from,
    });
    await seedPayout(t, fixture.assignmentId, {
      amount: 2_000,
      approvalStatus: "approved",
      reviewRequestedAt: from - DAY,
      approvedAt: range.to - 1,
    });
    await seedPayout(t, fixture.assignmentId, {
      amount: 9_000,
      approvalStatus: "approved",
      reviewRequestedAt: from,
      approvedAt: range.to,
    });
    const earnings = await t.run((ctx) => getCompanyEarnings(ctx, fixture.membership, range));
    expect(earnings.approvedInPeriod.amounts).toEqual([{ currency: "usd", amount: 3_000 }]);
    expect(earnings.creators).toEqual({ pending: 0, approved: 1, total: 1 });
  });

  test("marks capped payout totals instead of claiming they are complete", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const postId = await seedPost(t, fixture.assignmentId);
    for (let index = 0; index < 501; index++)
      await seedPayout(t, fixture.assignmentId, {
        postId,
        amount: 100,
        approvalStatus: "approved",
        approvedAt: from,
        reviewRequestedAt: from,
        transferredAt: from,
        paymentStatus: "transferred",
      });
    const earnings = await t.run((ctx) => getCompanyEarnings(ctx, fixture.membership, range));
    const overview = await t.run((ctx) =>
      getCompanyOverview(ctx, fixture.membership.companyId, range),
    );
    expect(earnings).toMatchObject({
      approvedInPeriod: { amounts: [{ currency: "usd", amount: 50_000 }] },
      isPartial: true,
    });
    expect(overview.spend).toEqual({
      amounts: [{ currency: "usd", amount: 50_000 }],
      campaignCount: 1,
      isPartial: true,
    });
  });

  test("keeps overdue approvals, separates held amounts, and counts each creator once", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t, {}, "admin");
    const clearAssignment = await t.run(async (ctx) => {
      const assignment = await ctx.db.get("assignments", fixture.assignmentId);
      if (!assignment) throw new Error("expected assignment");
      return assignment;
    });
    const blockedAssignment = await seedAssignment(t, {
      opportunityId: clearAssignment.opportunityId,
      creatorId: fixture.creatorId,
      status: "active",
    });
    await seedDispute(t, { ...fixture, assignmentId: blockedAssignment });
    await seedPayout(t, fixture.assignmentId, { amount: 1_000, approvalDueAt: from - DAY });
    await seedPayout(t, fixture.assignmentId, { amount: 2_000, approvalDueAt: from + DAY });
    await seedPayout(t, blockedAssignment, { amount: 5_000, approvalDueAt: from - 2 * DAY });
    await seedPayout(t, fixture.assignmentId, {
      amount: 3_000,
      approvalStatus: "approved",
      approvedAt: from + DAY,
      reviewRequestedAt: from,
    });
    await seedPayout(t, fixture.assignmentId, {
      approvalStatus: "approved",
      reviewRequestedAt: range.to,
    });
    const foreign = await seedCampaign(t, { subject: "foreign", orgId: "org_foreign" });
    await seedPayout(t, fixture.assignmentId, { companyId: foreign.membership.companyId });

    const earnings = await t.run((ctx) => getCompanyEarnings(ctx, fixture.membership, range));

    expect(earnings).toEqual({
      creators: { pending: 1, approved: 0, total: 1 },
      pending: {
        amounts: [{ currency: "usd", amount: 8_000 }],
        blockedAmounts: [{ currency: "usd", amount: 5_000 }],
        nextApprovalDueAt: from - DAY,
      },
      approvedInPeriod: { amounts: [{ currency: "usd", amount: 3_000 }] },
      canApprove: true,
      isPartial: false,
    });
  });

  test("reports an empty state and no approval authority for members", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    expect(await t.run((ctx) => getCompanyEarnings(ctx, fixture.membership, range))).toEqual({
      creators: { pending: 0, approved: 0, total: 0 },
      pending: { amounts: [], blockedAmounts: [], nextApprovalDueAt: null },
      approvedInPeriod: { amounts: [] },
      canApprove: false,
      isPartial: false,
    });
  });
});
