/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import { deactivateUser } from "../models/users";
import schema from "../schema";
import {
  expectApiError,
  seedOneSubmission,
  seedOperator,
  seedUser,
  seedWrongOrgCaller,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const POST_URL = "https://x.com/driftwood_dev/status/1843000000000000001";

/** Seeds an approved submission and the creator's post on it. */
async function seedPost(t: TestConvex) {
  const { fixture, submissionId } = await seedOneSubmission(t, "approved");
  const postId = await fixture.asCreator.mutation(api.posts.create, {
    submissionId,
    url: POST_URL,
  });
  return { fixture, submissionId, postId };
}

describe("posts.create", () => {
  test("records the calling creator's post", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);

    const post = await t.run(async (ctx) => await ctx.db.get("posts", postId));

    expect(post).toMatchObject({ url: POST_URL, isVerified: false });
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const { submissionId } = await seedOneSubmission(t, "approved");
    await expectApiError(
      () => t.mutation(api.posts.create, { submissionId, url: POST_URL }),
      "not_authenticated",
    );
  });

  test("rejects a company user", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, "approved");
    await expectApiError(
      () => fixture.asCompany.mutation(api.posts.create, { submissionId, url: POST_URL }),
      "forbidden",
    );
  });

  test("rejects an operator", async () => {
    const t = convexTest(schema, modules);
    const { submissionId } = await seedOneSubmission(t, "approved");
    const asOperator = await seedOperator(t, "operator");
    await expectApiError(
      () => asOperator.mutation(api.posts.create, { submissionId, url: POST_URL }),
      "forbidden",
    );
  });

  test("rejects a deactivated creator", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, "approved");
    await t.run(async (ctx) => await deactivateUser(ctx, "fixture-creator"));
    await expectApiError(
      () => fixture.asCreator.mutation(api.posts.create, { submissionId, url: POST_URL }),
      "account_deactivated",
    );
  });

  test("does not let a creator set verification or metrics", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, "approved");
    const args = { submissionId, url: POST_URL, isVerified: true, views: 1_000_000 };
    await expect(fixture.asCreator.mutation(api.posts.create, args)).rejects.toThrow(
      "Unexpected field",
    );
  });
});

describe("posts.get", () => {
  test("returns the post to its creator, the owning company, and an operator", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedPost(t);
    const asOperator = await seedOperator(t, "operator");

    for (const caller of [fixture.asCreator, fixture.asCompany, asOperator]) {
      const post = await caller.query(api.posts.get, { postId });
      expect(post._id).toBe(postId);
    }
  });

  test("conceals the post from another creator and another company", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    const asOtherCreator = await seedUser(t, { subject: "other_creator" });
    const asOtherCompany = await seedUser(t, {
      subject: "other_company",
      org: { id: "org_other" },
    });

    for (const caller of [asOtherCreator, asOtherCompany]) {
      await expectApiError(() => caller.query(api.posts.get, { postId }), "not_found");
    }
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    await expectApiError(() => t.query(api.posts.get, { postId }), "not_authenticated");
  });

  test("rejects a forged organization claim", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    const asWrongOrg = await seedWrongOrgCaller(t);
    await expectApiError(() => asWrongOrg.query(api.posts.get, { postId }), "forbidden");
  });
});

describe("posts.list", () => {
  const firstPage = { numItems: 10, cursor: null };

  test("lists an assignment's post for its creator and its company", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedPost(t);

    for (const caller of [fixture.asCreator, fixture.asCompany]) {
      const result = await caller.query(api.posts.list, {
        assignmentId: fixture.assignmentId,
        paginationOpts: firstPage,
      });
      expect(result.page.map((post) => post._id)).toEqual([postId]);
    }
  });

  test("lists a campaign's posts for the owning company", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedPost(t);
    const campaignId = await t.run(
      async (ctx) => (await ctx.db.get("assignments", fixture.assignmentId))!.campaignId,
    );

    const result = await fixture.asCompany.query(api.posts.list, {
      campaignId,
      paginationOpts: firstPage,
    });

    expect(result.page.map((post) => post._id)).toEqual([postId]);
  });

  test("refuses a creator listing a campaign", async () => {
    const t = convexTest(schema, modules);
    const { fixture } = await seedPost(t);
    const campaignId = await t.run(
      async (ctx) => (await ctx.db.get("assignments", fixture.assignmentId))!.campaignId,
    );

    await expectApiError(
      () => fixture.asCreator.query(api.posts.list, { campaignId, paginationOpts: firstPage }),
      "forbidden",
    );
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const { fixture } = await seedPost(t);
    await expectApiError(
      () =>
        t.query(api.posts.list, {
          assignmentId: fixture.assignmentId,
          paginationOpts: firstPage,
        }),
      "not_authenticated",
    );
  });

  test("rejects a forged organization claim", async () => {
    const t = convexTest(schema, modules);
    const { fixture } = await seedPost(t);
    const asWrongOrg = await seedWrongOrgCaller(t);
    await expectApiError(
      () =>
        asWrongOrg.query(api.posts.list, {
          assignmentId: fixture.assignmentId,
          paginationOpts: firstPage,
        }),
      "forbidden",
    );
  });
});

const NEW_URL = "https://x.com/driftwood_dev/status/1843000000000000009";

describe("posts.replace", () => {
  test("lets the creator replace the link with a new active post", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedPost(t);

    const post = await fixture.asCreator.mutation(api.posts.replace, { postId, url: NEW_URL });

    expect(post).toMatchObject({ url: NEW_URL, isActive: true });
    expect(post._id).not.toBe(postId);
  });

  test("rejects the owning company", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedPost(t);
    await expectApiError(
      () => fixture.asCompany.mutation(api.posts.replace, { postId, url: NEW_URL }),
      "forbidden",
    );
  });

  test("conceals the post from another creator", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    const asOtherCreator = await seedUser(t, { subject: "other_creator" });
    await expectApiError(
      () => asOtherCreator.mutation(api.posts.replace, { postId, url: NEW_URL }),
      "not_found",
    );
  });

  test("does not let a creator verify through replace", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedPost(t);
    const args = { postId, url: NEW_URL, isVerified: true };
    await expect(fixture.asCreator.mutation(api.posts.replace, args)).rejects.toThrow(
      "Unexpected field `isVerified`",
    );
  });
});

describe("posts.verify", () => {
  test("lets an operator verify a post", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    const asOperator = await seedOperator(t, "operator");

    const post = await asOperator.mutation(api.posts.verify, { postId, postedAt: Date.now() });

    expect(post.isVerified).toBe(true);
  });

  test("rejects the creator and the owning company", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedPost(t);

    for (const caller of [fixture.asCreator, fixture.asCompany]) {
      await expectApiError(
        () => caller.mutation(api.posts.verify, { postId, postedAt: Date.now() }),
        "forbidden",
      );
    }
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    await expectApiError(
      () => t.mutation(api.posts.verify, { postId, postedAt: Date.now() }),
      "not_authenticated",
    );
  });
});

describe("posts.unverify", () => {
  test("lets an operator unverify a verified post", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    const asOperator = await seedOperator(t, "operator");
    await asOperator.mutation(api.posts.verify, { postId, postedAt: Date.now() });

    const post = await asOperator.mutation(api.posts.unverify, { postId });

    expect(post.isVerified).toBe(false);
  });

  test("rejects the creator and the owning company", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedPost(t);

    for (const caller of [fixture.asCreator, fixture.asCompany]) {
      await expectApiError(() => caller.mutation(api.posts.unverify, { postId }), "forbidden");
    }
  });
});

describe("posts.updateViews", () => {
  test("stores views for server-side callers", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);

    const post = await t.mutation(internal.posts.updateViews, { postId, views: 48_000 });

    expect(post).toMatchObject({ views: 48_000 });
  });
});

describe("posts.updateEngagement", () => {
  test("stores engagement counts for server-side callers", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    const engagement = { likes: 120, comments: 14, reposts: 9, quotes: 3 };

    const post = await t.mutation(internal.posts.updateEngagement, { postId, ...engagement });

    expect(post).toMatchObject(engagement);
  });
});

describe("posts.checkCaption", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  test("compares the approved caption to long-form X text without calling Jev or verifying the post", async () => {
    const t = convexTest(schema, modules);
    const { postId, submissionId } = await seedPost(t);
    const asOperator = await seedOperator(t, "caption-operator");
    const longIntro = "Here is how we built the Driftwood demo. ".repeat(8);
    await t.run((ctx) =>
      ctx.db.patch("submissions", submissionId, {
        caption: `${longIntro}Café demo\r\n#ad https://example.com/launch`,
      }),
    );
    vi.stubEnv("X_BEARER_TOKEN", "x-test");
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: {
            id: "1843000000000000001",
            text: longIntro.slice(0, 280),
            note_post: {
              text: ` ${longIntro}Cafe\u0301 demo\n#ad https://t.co/launch https://t.co/video `,
              entities: {
                urls: [
                  { url: "https://t.co/launch", expanded_url: "https://example.com/launch" },
                  {
                    url: "https://t.co/video",
                    expanded_url: "https://x.com/driftwood_dev/status/1843000000000000001/video/1",
                    media_key: "7_video",
                  },
                ],
              },
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: { id: "1843000000000000001", text: "Café demo" },
        }),
      );
    vi.stubGlobal("fetch", fetch);

    expect(await asOperator.action(api.posts.checkCaption, { postId })).toBe("match");
    expect(await asOperator.action(api.posts.checkCaption, { postId })).toBe("mismatch");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.x.com/2/tweets/1843000000000000001?post.fields=note_post,entities",
      expect.objectContaining({ headers: { Authorization: "Bearer x-test" } }),
    );
    expect(await t.run((ctx) => ctx.db.get("posts", postId))).toMatchObject({ isVerified: false });
  });

  test("matches an ordinary caption with a creator-authored link but rejects a changed destination", async () => {
    const t = convexTest(schema, modules);
    const { postId, submissionId } = await seedPost(t);
    const asOperator = await seedOperator(t, "caption-operator");
    await t.run((ctx) =>
      ctx.db.patch("submissions", submissionId, {
        caption: "Demo (https://example.com/demo). #ad",
      }),
    );
    vi.stubEnv("X_BEARER_TOKEN", "x-test");
    /** Models X supplying the same short URL for different test destinations. */
    function responseWithLink(expandedUrl: string) {
      return Response.json({
        data: {
          id: "1843000000000000001",
          text: "Demo (https://t.co/abc). #ad",
          entities: { urls: [{ url: "https://t.co/abc", expanded_url: expandedUrl }] },
        },
      });
    }
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(responseWithLink("https://example.com/demo"))
        .mockResolvedValueOnce(responseWithLink("https://example.com/other")),
    );

    expect(await asOperator.action(api.posts.checkCaption, { postId })).toBe("match");
    expect(await asOperator.action(api.posts.checkCaption, { postId })).toBe("mismatch");
  });

  test("rejects X results if the creator replaced the post during the lookup", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId, submissionId } = await seedPost(t);
    const asOperator = await seedOperator(t, "caption-operator");
    const caption = "Driftwood demo";
    await t.run((ctx) => ctx.db.patch("submissions", submissionId, { caption }));
    vi.stubEnv("X_BEARER_TOKEN", "x-test");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await fixture.asCreator.mutation(api.posts.replace, {
          postId,
          url: "https://x.com/driftwood_dev/status/1843000000000000002",
        });
        return Response.json({ data: { id: "1843000000000000001", text: caption } });
      }),
    );

    await expectApiError(
      () => asOperator.action(api.posts.checkCaption, { postId }),
      "invalid_state",
      "post_inactive",
    );
  });

  test("rejects a creator and skips the lookup for a submission without a caption", async () => {
    const t = convexTest(schema, modules);
    const { postId, fixture } = await seedPost(t);
    const asOperator = await seedOperator(t, "caption-operator");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);

    await expectApiError(
      () => fixture.asCreator.action(api.posts.checkCaption, { postId }),
      "forbidden",
    );
    expect(await asOperator.action(api.posts.checkCaption, { postId })).toBe("no_caption");
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("posts.checkMyCaption", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  async function seedCaptionPost(t: TestConvex, hasVideo: boolean) {
    const { fixture, postId, submissionId } = await seedPost(t);
    await t.run(async (ctx) => {
      const submission = await ctx.db.get("submissions", submissionId);
      if (!submission) throw new Error("Expected an approved submission");
      await ctx.db.patch("submissions", submissionId, {
        caption: "Café #ad\nhttps://example.com/launch",
        mediaId: hasVideo ? submission.mediaId : undefined,
      });
      await ctx.db.insert("xAccounts", {
        creatorId: fixture.creatorId,
        xUserId: "100",
        username: "driftwood_dev",
        displayName: "Driftwood",
        linkedAt: Date.now(),
        updatedAt: Date.now(),
        status: "connected",
      });
    });
    return { fixture, postId };
  }

  function stubLookup(fields: Record<string, unknown> = {}) {
    vi.stubEnv("X_BEARER_TOKEN", "fixture-token");
    const lookup = vi.fn().mockResolvedValue(
      Response.json({
        data: {
          id: POST_URL.split("/").at(-1),
          text: "Cafe\u0301 #ad\r\nhttps://t.co/link",
          entities: {
            urls: [{ url: "https://t.co/link", expanded_url: "https://example.com/launch" }],
          },
          author_id: "100",
          created_at: new Date(Math.floor(Date.now() / 1000) * 1000).toISOString(),
          ...fields,
        },
      }),
    );
    vi.stubGlobal("fetch", lookup);
    return lookup;
  }

  test("verifies an owned caption-only match once and records X's publish time", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedCaptionPost(t, false);
    const lookup = stubLookup();

    expect(await fixture.asCreator.action(api.posts.checkMyCaption, { postId })).toEqual({
      status: "match",
    });
    expect(await fixture.asCreator.action(api.posts.checkMyCaption, { postId })).toEqual({
      status: "alreadyChecked",
    });
    const post = await fixture.asCreator.query(api.posts.get, { postId });
    expect(post).toMatchObject({
      isVerified: true,
      captionCheck: "match",
      postedAt: expect.any(Number),
    });
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  test("keeps a matching video draft unverified", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedCaptionPost(t, true);
    stubLookup();

    expect(await fixture.asCreator.action(api.posts.checkMyCaption, { postId })).toEqual({
      status: "match",
    });
    expect(await fixture.asCreator.query(api.posts.get, { postId })).toMatchObject({
      captionCheck: "match",
      isVerified: false,
    });
  });

  test("does not verify another X account's identical caption", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedCaptionPost(t, false);
    stubLookup({ author_id: "200" });

    expect(await fixture.asCreator.action(api.posts.checkMyCaption, { postId })).toEqual({
      status: "mismatch",
      publishedCaption: "Café #ad\r\nhttps://example.com/launch",
    });
    expect(await fixture.asCreator.query(api.posts.get, { postId })).toMatchObject({
      isVerified: false,
    });
  });

  const publicMetrics = {
    impression_count: 1250,
    like_count: 38,
    reply_count: 3,
    retweet_count: 7,
    quote_count: 1,
  };

  test("stores the counts read at verification, in the same X request", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedCaptionPost(t, false);
    const lookup = stubLookup({ public_metrics: publicMetrics });

    expect(await fixture.asCreator.action(api.posts.checkMyCaption, { postId })).toEqual({
      status: "match",
    });

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(String(lookup.mock.calls[0]![0])).toContain("public_metrics");
    expect(await fixture.asCreator.query(api.posts.get, { postId })).toMatchObject({
      isVerified: true,
      views: 1250,
      viewsUpdatedAt: expect.any(Number),
      likes: 38,
      comments: 3,
      reposts: 7,
      quotes: 1,
    });
  });

  test("stores no counts when a match leaves the post unverified", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedCaptionPost(t, true);
    stubLookup({ public_metrics: publicMetrics });

    await fixture.asCreator.action(api.posts.checkMyCaption, { postId });

    const post = await fixture.asCreator.query(api.posts.get, { postId });
    expect(post).toMatchObject({ isVerified: false });
    expect(post).not.toHaveProperty("views");
    expect(post).not.toHaveProperty("likes");
  });

  test("unusable counts never block verification", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedCaptionPost(t, false);
    stubLookup({ public_metrics: { ...publicMetrics, impression_count: -1 } });

    expect(await fixture.asCreator.action(api.posts.checkMyCaption, { postId })).toEqual({
      status: "match",
    });

    const post = await fixture.asCreator.query(api.posts.get, { postId });
    expect(post).toMatchObject({ isVerified: true });
    expect(post).not.toHaveProperty("views");
    expect(post).not.toHaveProperty("likes");
  });

  test("does not call X for someone else's post or for a video without a caption", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedPost(t);
    const other = await seedUser(t, { subject: "other-caption-caller" });
    const lookup = stubLookup();

    await expectApiError(() => other.action(api.posts.checkMyCaption, { postId }), "not_found");
    expect(await fixture.asCreator.action(api.posts.checkMyCaption, { postId })).toEqual({
      status: "manualReview",
    });
    expect(lookup).not.toHaveBeenCalled();
  });
});
