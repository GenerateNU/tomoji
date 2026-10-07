/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import {
  createPost,
  listPosts,
  requirePost,
  unverifyPost,
  updatePost,
  updatePostMetrics,
  verifyPost,
} from "../../models/posts";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignment,
  seedCampaign,
  seedCreatorId,
  seedMembership,
  seedOneSubmission,
  seedOpportunity,
  type AssignmentFixture,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const POST_URL = "https://x.com/driftwood_dev/status/1843000000000000001";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

/** Reads every post so rejections can assert nothing was written. */
async function storedPosts(t: TestConvex) {
  return await t.run(async (ctx) => await ctx.db.query("posts").take(10));
}

describe("createPost", () => {
  test("creates an unverified post for the creator's approved submission", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, "approved");
    const campaignId = await t.run(
      async (ctx) => (await ctx.db.get("assignments", fixture.assignmentId))!.campaignId,
    );

    const postId = await t.run(
      async (ctx) => await createPost(ctx, fixture.creatorId, { submissionId, url: POST_URL }),
    );

    expect(await storedPosts(t)).toEqual([
      {
        _id: postId,
        _creationTime: expect.any(Number),
        submissionId,
        campaignId,
        url: POST_URL,
        postedAt: Date.now(),
        isVerified: false,
      },
    ]);
  });

  test.each([
    ["twitter.com", "https://twitter.com/driftwood_dev/status/1843000000000000001"],
    ["www and a trailing slash", "https://www.x.com/driftwood_dev/status/1843000000000000001/"],
    [
      "mobile and a query",
      "https://mobile.twitter.com/driftwood_dev/status/1843000000000000001?s=20",
    ],
    ["http and spaces", "  http://x.com/driftwood_dev/status/1843000000000000001  "],
  ])("stores the canonical x.com link for %s", async (_label, url) => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, "approved");

    await t.run(async (ctx) => await createPost(ctx, fixture.creatorId, { submissionId, url }));

    expect((await storedPosts(t))[0]?.url).toBe(POST_URL);
  });

  test.each([
    ["a blank link", "   "],
    ["another site", "https://instagram.com/p/C1234567890"],
    ["a lookalike domain", "https://x.com.evil.example/driftwood_dev/status/1843000000000000001"],
    ["a profile instead of a post", "https://x.com/driftwood_dev"],
    ["a non-numeric post id", "https://x.com/driftwood_dev/status/latest"],
    ["login details", "https://user:pass@x.com/driftwood_dev/status/1843000000000000001"],
    ["a non-web scheme", "javascript:alert(1)"],
    ["text that isn't a URL", "my post"],
  ])("refuses %s without writing", async (_label, url) => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, "approved");

    await expect(
      t.run(async (ctx) => await createPost(ctx, fixture.creatorId, { submissionId, url })),
    ).rejects.toMatchObject({ data: { code: "invalid_state" } });
    expect(await storedPosts(t)).toEqual([]);
  });

  test.each(["pending", "changesRequested"] as const)("refuses a %s submission", async (status) => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, status);

    await expect(
      t.run(
        async (ctx) => await createPost(ctx, fixture.creatorId, { submissionId, url: POST_URL }),
      ),
    ).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "submission_not_approved" },
    });
    expect(await storedPosts(t)).toEqual([]);
  });

  test.each(["termsPending", "completed", "cancelled"] as const)(
    "refuses when the assignment is %s",
    async (status) => {
      const t = convexTest(schema, modules);
      const { fixture, submissionId } = await seedOneSubmission(t, "approved", { status });

      await expect(
        t.run(
          async (ctx) => await createPost(ctx, fixture.creatorId, { submissionId, url: POST_URL }),
        ),
      ).rejects.toMatchObject({
        data: { code: "invalid_state", reason: "assignment_not_active" },
      });
      expect(await storedPosts(t)).toEqual([]);
    },
  );

  test("allows only one post per submission", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, "approved");
    await t.run(
      async (ctx) => await createPost(ctx, fixture.creatorId, { submissionId, url: POST_URL }),
    );
    const before = await storedPosts(t);

    await expect(
      t.run(
        async (ctx) =>
          await createPost(ctx, fixture.creatorId, {
            submissionId,
            url: "https://x.com/driftwood_dev/status/1843000000000000002",
          }),
      ),
    ).rejects.toMatchObject({ data: { code: "conflict", reason: "already_posted" } });
    expect(await storedPosts(t)).toEqual(before);
  });

  test("conceals another creator's submission", async () => {
    const t = convexTest(schema, modules);
    const { submissionId } = await seedOneSubmission(t, "approved");
    const otherCreatorId = await seedCreatorId(t, "other_creator");

    await expectApiError(
      () =>
        t.run(
          async (ctx) => await createPost(ctx, otherCreatorId, { submissionId, url: POST_URL }),
        ),
      "not_found",
    );
    expect(await storedPosts(t)).toEqual([]);
  });

  test("reports a missing submission as not found", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, "approved");
    await t.run(async (ctx) => await ctx.db.delete("submissions", submissionId));

    await expectApiError(
      () =>
        t.run(
          async (ctx) => await createPost(ctx, fixture.creatorId, { submissionId, url: POST_URL }),
        ),
      "not_found",
    );
  });
});

describe("requirePost", () => {
  async function seedPost(t: TestConvex) {
    const { fixture, submissionId } = await seedOneSubmission(t, "approved");
    const postId: Id<"posts"> = await t.run(
      async (ctx) => await createPost(ctx, fixture.creatorId, { submissionId, url: POST_URL }),
    );
    return { fixture, postId };
  }

  test("returns the post to its creator, the owning company, and operators", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedPost(t);

    for (const viewer of [
      { role: "creator" as const, creatorId: fixture.creatorId },
      { role: "company" as const, companyId: fixture.membership.companyId },
      { role: "operator" as const },
    ]) {
      const post = await t.run(async (ctx) => await requirePost(ctx, viewer, postId));
      expect(post._id).toBe(postId);
    }
  });

  test("conceals the post from other creators and companies", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    const otherCreatorId = await seedCreatorId(t, "other_creator");
    const { membership: otherMembership } = await seedMembership(t, "other_company");

    for (const viewer of [
      { role: "creator" as const, creatorId: otherCreatorId },
      { role: "company" as const, companyId: otherMembership.companyId },
    ]) {
      await expectApiError(
        () => t.run(async (ctx) => await requirePost(ctx, viewer, postId)),
        "not_found",
      );
    }
  });

  test("reports a missing post as not found", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    await t.run(async (ctx) => await ctx.db.delete("posts", postId));

    await expectApiError(
      () => t.run(async (ctx) => await requirePost(ctx, { role: "operator" }, postId)),
      "not_found",
    );
  });
});

const firstPage = { numItems: 10, cursor: null };

/**
 * Adds another creator's post to the fixture's campaign: a new assignment on
 * the same opportunity, an approved submission, and the post.
 */
async function addPost(t: TestConvex, fixture: AssignmentFixture, subject: string) {
  vi.setSystemTime(Date.now() + 1000);
  const creatorId = await seedCreatorId(t, subject);
  const opportunityId = await t.run(
    async (ctx) => (await ctx.db.get("assignments", fixture.assignmentId))!.opportunityId,
  );
  const assignmentId = await seedAssignment(t, { opportunityId, creatorId, status: "active" });
  return await t.run(async (ctx) => {
    const submissionId = await ctx.db.insert("submissions", {
      assignmentId,
      draftUrl: "https://drive.example.com/drafts/another",
      draftDescription: "Another draft",
      usesAiReview: false,
      status: "approved",
      reviewerType: "companyUser",
      reviewedBy: fixture.membership._id,
      reviewedAt: Date.now(),
    });
    return await createPost(ctx, creatorId, {
      submissionId,
      url: `https://x.com/${subject}/status/${Date.now()}`,
    });
  });
}

/** Seeds the fixture's approved submission and its post. */
async function seedFixturePost(t: TestConvex) {
  const { fixture, submissionId } = await seedOneSubmission(t, "approved");
  const postId = await t.run(
    async (ctx) => await createPost(ctx, fixture.creatorId, { submissionId, url: POST_URL }),
  );
  const campaignId = await t.run(
    async (ctx) => (await ctx.db.get("assignments", fixture.assignmentId))!.campaignId,
  );
  return { fixture, postId, campaignId };
}

const ids = (page: { _id: Id<"posts"> }[]) => page.map((post) => post._id);

describe("listPosts by assignment", () => {
  test("returns the assignment's post to its creator, its company, and operators", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedFixturePost(t);
    await addPost(t, fixture, "other_creator");

    for (const viewer of [
      { role: "creator" as const, creatorId: fixture.creatorId },
      { role: "company" as const, companyId: fixture.membership.companyId },
      { role: "operator" as const },
    ]) {
      const result = await t.run(
        async (ctx) =>
          await listPosts(ctx, viewer, {
            assignmentId: fixture.assignmentId,
            paginationOpts: firstPage,
          }),
      );
      expect(ids(result.page)).toEqual([postId]);
      expect(result.isDone).toBe(true);
    }
  });

  test.each(["pending", "changesRequested", "approved"] as const)(
    "returns an empty page when the latest submission is %s with no post",
    async (status) => {
      const t = convexTest(schema, modules);
      const { fixture } = await seedOneSubmission(t, status);

      const result = await t.run(
        async (ctx) =>
          await listPosts(
            ctx,
            { role: "operator" },
            { assignmentId: fixture.assignmentId, paginationOpts: firstPage },
          ),
      );

      expect(result.page).toEqual([]);
      expect(result.isDone).toBe(true);
    },
  );

  test("conceals another creator's assignment", async () => {
    const t = convexTest(schema, modules);
    const { fixture } = await seedFixturePost(t);
    const otherCreatorId = await seedCreatorId(t, "other_creator");

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await listPosts(
              ctx,
              { role: "creator", creatorId: otherCreatorId },
              { assignmentId: fixture.assignmentId, paginationOpts: firstPage },
            ),
        ),
      "not_found",
    );
  });
});

describe("listPosts by campaign", () => {
  test("lists the campaign's posts newest first and excludes other campaigns", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId, campaignId } = await seedFixturePost(t);
    const second = await addPost(t, fixture, "second_creator");
    const third = await addPost(t, fixture, "third_creator");
    const other = await seedOpportunity(t, { subject: "other_owner", orgId: "org_other" });
    const otherCreatorId = await seedCreatorId(t, "other_campaign_creator");
    const otherAssignmentId = await seedAssignment(t, {
      opportunityId: other.opportunityId,
      creatorId: otherCreatorId,
      status: "active",
    });
    await t.run(async (ctx) => {
      const submissionId = await ctx.db.insert("submissions", {
        assignmentId: otherAssignmentId,
        draftUrl: "https://drive.example.com/drafts/other",
        draftDescription: "Other campaign draft",
        usesAiReview: false,
        status: "approved",
        reviewerType: "companyUser",
        reviewedBy: other.membership._id,
        reviewedAt: Date.now(),
      });
      await createPost(ctx, otherCreatorId, {
        submissionId,
        url: "https://x.com/other_creator/status/1",
      });
    });

    for (const viewer of [
      { role: "company" as const, companyId: fixture.membership.companyId },
      { role: "operator" as const },
    ]) {
      const result = await t.run(
        async (ctx) => await listPosts(ctx, viewer, { campaignId, paginationOpts: firstPage }),
      );
      expect(ids(result.page)).toEqual([third, second, postId]);
    }
  });

  test("pages through a campaign's posts", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId, campaignId } = await seedFixturePost(t);
    const second = await addPost(t, fixture, "second_creator");
    const third = await addPost(t, fixture, "third_creator");
    const operator = { role: "operator" as const };

    const first = await t.run(
      async (ctx) =>
        await listPosts(ctx, operator, {
          campaignId,
          paginationOpts: { numItems: 2, cursor: null },
        }),
    );
    const next = await t.run(
      async (ctx) =>
        await listPosts(ctx, operator, {
          campaignId,
          paginationOpts: { numItems: 2, cursor: first.continueCursor },
        }),
    );

    expect([...ids(first.page), ...ids(next.page)]).toEqual([third, second, postId]);
  });

  test("conceals another company's campaign", async () => {
    const t = convexTest(schema, modules);
    const { campaignId } = await seedFixturePost(t);
    const other = await seedCampaign(t, { subject: "other_owner", orgId: "org_other" });

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await listPosts(
              ctx,
              { role: "company", companyId: other.membership.companyId },
              { campaignId, paginationOpts: firstPage },
            ),
        ),
      "not_found",
    );
  });

  test("refuses creators, who only see their own posts", async () => {
    const t = convexTest(schema, modules);
    const { fixture, campaignId } = await seedFixturePost(t);

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await listPosts(
              ctx,
              { role: "creator", creatorId: fixture.creatorId },
              { campaignId, paginationOpts: firstPage },
            ),
        ),
      "forbidden",
    );
  });
});

describe("listPosts filters", () => {
  test.each([
    ["neither filter", {}],
    ["both filters", { both: true }],
  ])("refuses %s", async (_label, mode) => {
    const t = convexTest(schema, modules);
    const { fixture, campaignId } = await seedFixturePost(t);
    const filters = "both" in mode ? { assignmentId: fixture.assignmentId, campaignId } : {};

    await expect(
      t.run(
        async (ctx) =>
          await listPosts(ctx, { role: "operator" }, { ...filters, paginationOpts: firstPage }),
      ),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "invalid_filter" } });
  });
});

const NEW_URL = "https://x.com/driftwood_dev/status/1843000000000000009";
const METRICS = { likes: 120, comments: 14, reposts: 9, views: 48_000 };

describe("updatePost", () => {
  test("replaces the link, resets postedAt, and clears metrics from the old link", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedFixturePost(t);
    await t.run(async (ctx) => await updatePostMetrics(ctx, postId, METRICS));
    vi.setSystemTime(Date.now() + 60_000);

    const result = await t.run(
      async (ctx) => await updatePost(ctx, fixture.creatorId, postId, { url: NEW_URL }),
    );

    const stored = await t.run(async (ctx) => await ctx.db.get("posts", postId));
    expect(result).toEqual(stored);
    expect(stored).toMatchObject({ url: NEW_URL, postedAt: Date.now(), isVerified: false });
    for (const field of ["likes", "comments", "reposts", "views", "metricsUpdatedAt"]) {
      expect(stored).not.toHaveProperty(field);
    }
  });

  test("refuses a verified post without changing it", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedFixturePost(t);
    await t.run(async (ctx) => await verifyPost(ctx, postId));
    const before = await storedPosts(t);

    await expect(
      t.run(async (ctx) => await updatePost(ctx, fixture.creatorId, postId, { url: NEW_URL })),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "post_verified" } });
    expect(await storedPosts(t)).toEqual(before);
  });

  test.each(["completed", "cancelled"] as const)(
    "refuses when the assignment is %s",
    async (status) => {
      const t = convexTest(schema, modules);
      const { fixture, postId } = await seedFixturePost(t);
      await t.run(
        async (ctx) => await ctx.db.patch("assignments", fixture.assignmentId, { status }),
      );

      await expect(
        t.run(async (ctx) => await updatePost(ctx, fixture.creatorId, postId, { url: NEW_URL })),
      ).rejects.toMatchObject({
        data: { code: "invalid_state", reason: "assignment_not_active" },
      });
    },
  );

  test("refuses a link that isn't an X post", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedFixturePost(t);
    const before = await storedPosts(t);

    await expect(
      t.run(
        async (ctx) =>
          await updatePost(ctx, fixture.creatorId, postId, { url: "https://x.com/driftwood_dev" }),
      ),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "url_invalid" } });
    expect(await storedPosts(t)).toEqual(before);
  });

  test("conceals another creator's post", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedFixturePost(t);
    const otherCreatorId = await seedCreatorId(t, "other_creator");

    await expectApiError(
      () => t.run(async (ctx) => await updatePost(ctx, otherCreatorId, postId, { url: NEW_URL })),
      "not_found",
    );
  });
});

describe("verifyPost", () => {
  test("marks an unverified post verified", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedFixturePost(t);

    const result = await t.run(async (ctx) => await verifyPost(ctx, postId));

    const stored = await t.run(async (ctx) => await ctx.db.get("posts", postId));
    expect(result).toEqual(stored);
    expect(stored?.isVerified).toBe(true);
  });

  test("refuses a post that is already verified", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedFixturePost(t);
    await t.run(async (ctx) => await verifyPost(ctx, postId));

    await expect(t.run(async (ctx) => await verifyPost(ctx, postId))).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "post_already_verified" },
    });
  });

  test("reports a missing post as not found", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedFixturePost(t);
    await t.run(async (ctx) => await ctx.db.delete("posts", postId));

    await expectApiError(() => t.run(async (ctx) => await verifyPost(ctx, postId)), "not_found");
  });
});

describe("updatePostMetrics", () => {
  test("stores the counts and when they were fetched", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedFixturePost(t);

    const result = await t.run(async (ctx) => await updatePostMetrics(ctx, postId, METRICS));

    const stored = await t.run(async (ctx) => await ctx.db.get("posts", postId));
    expect(result).toEqual(stored);
    expect(stored).toMatchObject({ ...METRICS, metricsUpdatedAt: Date.now() });
  });

  test.each([
    ["a negative count", { ...METRICS, views: -1 }],
    ["a fractional count", { ...METRICS, likes: 1.5 }],
    ["a non-finite count", { ...METRICS, reposts: Number.POSITIVE_INFINITY }],
  ])("refuses %s without writing", async (_label, metrics) => {
    const t = convexTest(schema, modules);
    const { postId } = await seedFixturePost(t);
    const before = await storedPosts(t);

    await expect(
      t.run(async (ctx) => await updatePostMetrics(ctx, postId, metrics)),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "invalid_metrics" } });
    expect(await storedPosts(t)).toEqual(before);
  });

  test("reports a missing post as not found", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedFixturePost(t);
    await t.run(async (ctx) => await ctx.db.delete("posts", postId));

    await expectApiError(
      () => t.run(async (ctx) => await updatePostMetrics(ctx, postId, METRICS)),
      "not_found",
    );
  });
});

describe("unverifyPost", () => {
  test("marks a verified post unverified so the creator can fix it", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedFixturePost(t);
    await t.run(async (ctx) => await verifyPost(ctx, postId));

    const result = await t.run(async (ctx) => await unverifyPost(ctx, postId));

    const stored = await t.run(async (ctx) => await ctx.db.get("posts", postId));
    expect(result).toEqual(stored);
    expect(stored?.isVerified).toBe(false);
    await t.run(async (ctx) => await updatePost(ctx, fixture.creatorId, postId, { url: NEW_URL }));
  });

  test("refuses a post that isn't verified", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedFixturePost(t);

    await expect(t.run(async (ctx) => await unverifyPost(ctx, postId))).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "post_not_verified" },
    });
  });

  test("reports a missing post as not found", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedFixturePost(t);
    await t.run(async (ctx) => await ctx.db.delete("posts", postId));

    await expectApiError(() => t.run(async (ctx) => await unverifyPost(ctx, postId)), "not_found");
  });
});
