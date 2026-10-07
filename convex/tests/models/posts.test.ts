/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import { createPost, requirePost } from "../../models/posts";
import schema from "../../schema";
import {
  expectApiError,
  seedCreatorId,
  seedMembership,
  seedOneSubmission,
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
