/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignment,
  seedAssignmentFixture,
  seedCreatorId,
  seedOpportunity,
  seedOperator,
  seedPayout,
  seedPost,
  workosIdentity,
  type AssignmentFixture,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 20, 12);

/** Seeds a verified post on the fixture's assignment with a caption and metrics. */
async function seedMyPost(
  t: TestConvex,
  fixture: AssignmentFixture,
  fields: { postedAt: number; caption?: string; views?: number; likes?: number } = {
    postedAt: NOW,
  },
): Promise<Id<"posts">> {
  const postId = await seedPost(t, fixture.assignmentId);
  await t.run(async (ctx) => {
    const post = await ctx.db.get("posts", postId);
    if (post === null) throw new Error("expected seeded post");
    await ctx.db.patch("posts", postId, {
      postedAt: fields.postedAt,
      views: fields.views,
      viewsUpdatedAt: fields.views === undefined ? undefined : fields.postedAt + DAY,
      likes: fields.likes,
    });
    if (fields.caption !== undefined) {
      await ctx.db.patch("submissions", post.submissionId, { caption: fields.caption });
    }
  });
  return postId;
}

/** Seeds another creator's assignment and post at a different company. */
async function seedOtherCreatorPost(t: TestConvex) {
  const { opportunityId } = await seedOpportunity(t, {
    subject: "other-company",
    orgId: "org_other",
  });
  const creatorId = await seedCreatorId(t, "other-creator");
  const assignmentId = await seedAssignment(t, { opportunityId, creatorId, status: "active" });
  const postId = await seedPost(t, assignmentId);
  return {
    postId,
    assignmentId,
    asOther: t.withIdentity(workosIdentity({ subject: "other-creator" })),
  };
}

async function seedSnapshot(t: TestConvex, postId: Id<"posts">, observedAt: number, views: number) {
  await t.run(async (ctx) => {
    await ctx.db.insert("postViewSnapshots", {
      postId,
      observedAt,
      views,
      sourceKey: `test:${observedAt}`,
      receivedAt: observedAt,
    });
  });
}

describe("posts.listMine", () => {
  test("lists the caller's active posts newest first with their brief and earnings", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const older = await seedMyPost(t, fixture, { postedAt: NOW - 3 * DAY, views: 1_200 });
    const newer = await seedMyPost(t, fixture, {
      postedAt: NOW - DAY,
      caption: "Shipping with Driftwood",
      views: 800,
      likes: 42,
    });
    await seedPayout(t, fixture.assignmentId, { postId: newer, amount: 1_500 });
    await seedPayout(t, fixture.assignmentId, { postId: newer, amount: 500 });
    await seedOtherCreatorPost(t);

    const result = await fixture.asCreator.query(api.posts.listMine, {});

    expect(result.isPartial).toBe(false);
    expect(result.posts.map((post) => post.postId)).toEqual([newer, older]);
    const { opportunity, company, deliverable } = await t.run(async (ctx) => {
      const assignment = await ctx.db.get("assignments", fixture.assignmentId);
      return {
        opportunity: await ctx.db.get("opportunities", assignment!.opportunityId),
        company: await ctx.db.get("companies", assignment!.companyId),
        deliverable: await ctx.db.get("deliverables", fixture.deliverableId),
      };
    });
    expect(result.posts[0]).toMatchObject({
      postId: newer,
      assignmentId: fixture.assignmentId,
      postedAt: NOW - DAY,
      caption: "Shipping with Driftwood",
      title: deliverable!.title,
      opportunityTitle: opportunity!.title,
      companyName: company!.name,
      views: 800,
      likes: 42,
      earnings: 2_000,
    });
    expect(result.posts[0].mediaId).toBeDefined();
    expect(result.posts[1]).toMatchObject({ postId: older, earnings: 0, views: 1_200 });
    expect(result.posts[1]).not.toHaveProperty("likes");
    expect(result.metricsUpdatedAt).toBe(NOW);
  });

  test("leaves out replaced posts and other creators' posts", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const replaced = await seedMyPost(t, fixture);
    await t.run(async (ctx) => await ctx.db.patch("posts", replaced, { isActive: false }));
    const { postId: theirs, asOther } = await seedOtherCreatorPost(t);

    expect((await fixture.asCreator.query(api.posts.listMine, {})).posts).toEqual([]);
    const other = await asOther.query(api.posts.listMine, {});
    expect(other.posts.map((post) => post.postId)).toEqual([theirs]);
    expect(other.metricsUpdatedAt).toBeNull();
  });

  test("counts a deliverable's payouts on its current post after a replacement", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const original = await seedMyPost(t, fixture);
    const current = await seedMyPost(t, fixture);
    await t.run(async (ctx) => await ctx.db.patch("posts", original, { isActive: false }));
    await seedPayout(t, fixture.assignmentId, {
      postId: original,
      deliverableId: fixture.deliverableId,
      amount: 700,
    });

    const result = await fixture.asCreator.query(api.posts.listMine, {});

    expect(result.posts).toMatchObject([{ postId: current, earnings: 700 }]);
  });

  test("is for creators only", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await expectApiError(() => fixture.asCompany.query(api.posts.listMine, {}), "forbidden");
    const asOperator = await seedOperator(t, "operator");
    await expectApiError(() => asOperator.query(api.posts.listMine, {}), "forbidden");
    await expectApiError(() => t.query(api.posts.listMine, {}), "not_authenticated");
  });
});

describe("posts.getMine", () => {
  test("returns the post with its agreed terms and earnings over time", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const postId = await seedMyPost(t, fixture, { postedAt: NOW - 5 * DAY, views: 4_000 });
    await seedPayout(t, fixture.assignmentId, {
      postId,
      amount: 300,
      reviewRequestedAt: NOW - DAY,
    });
    await seedPayout(t, fixture.assignmentId, {
      postId,
      amount: 1_000,
      reviewRequestedAt: NOW - 3 * DAY,
    });

    const post = await fixture.asCreator.query(api.posts.getMine, { postId });

    expect(post).toMatchObject({
      postId,
      assignmentId: fixture.assignmentId,
      views: 4_000,
      earnings: 1_300,
      fixedFeeCents: 10_000,
      cpmRateCents: 500,
      paymentCapCents: 25_000,
      earningsHistory: [
        { at: NOW - 3 * DAY, amount: 1_000 },
        { at: NOW - DAY, amount: 300 },
      ],
    });
  });

  test("hides another creator's post and refuses companies", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const { postId: theirs } = await seedOtherCreatorPost(t);
    const mine = await seedMyPost(t, fixture);

    await expectApiError(
      () => fixture.asCreator.query(api.posts.getMine, { postId: theirs }),
      "not_found",
    );
    await expectApiError(
      () => fixture.asCompany.query(api.posts.getMine, { postId: mine }),
      "forbidden",
    );
  });
});

describe("posts.viewHistory", () => {
  test("returns each view increase since `from`, measured from the last count before it", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const first = await seedMyPost(t, fixture, { postedAt: NOW - 20 * DAY });
    const second = await seedMyPost(t, fixture, { postedAt: NOW - 2 * DAY });
    const from = NOW - 10 * DAY;
    await seedSnapshot(t, first, NOW - 15 * DAY, 1_000);
    await seedSnapshot(t, first, NOW - 5 * DAY, 1_600);
    await seedSnapshot(t, second, NOW - DAY, 250);
    await seedSnapshot(t, second, NOW, 400);

    const history = await fixture.asCreator.query(api.posts.viewHistory, { from });

    expect(history).toEqual({
      total: 1_000,
      views: [
        { at: NOW - 5 * DAY, amount: 600 },
        { at: NOW - DAY, amount: 250 },
        { at: NOW, amount: 150 },
      ],
      isPartial: false,
    });

    const one = await fixture.asCreator.query(api.posts.viewHistory, {
      from: null,
      postId: first,
    });
    expect(one.views).toEqual([
      { at: NOW - 15 * DAY, amount: 1_000 },
      { at: NOW - 5 * DAY, amount: 600 },
    ]);
  });

  test("hides another creator's post", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const { postId: theirs } = await seedOtherCreatorPost(t);
    await seedSnapshot(t, theirs, NOW, 9_000);

    await expectApiError(
      () => fixture.asCreator.query(api.posts.viewHistory, { from: null, postId: theirs }),
      "not_found",
    );
    expect(await fixture.asCreator.query(api.posts.viewHistory, { from: null })).toEqual({
      total: 0,
      views: [],
      isPartial: false,
    });
  });
});
