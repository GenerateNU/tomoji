/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
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

describe("posts.update", () => {
  test("lets the creator replace the link", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedPost(t);

    const post = await fixture.asCreator.mutation(api.posts.update, { postId, url: NEW_URL });

    expect(post.url).toBe(NEW_URL);
  });

  test("rejects the owning company", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedPost(t);
    await expectApiError(
      () => fixture.asCompany.mutation(api.posts.update, { postId, url: NEW_URL }),
      "forbidden",
    );
  });

  test("conceals the post from another creator", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    const asOtherCreator = await seedUser(t, { subject: "other_creator" });
    await expectApiError(
      () => asOtherCreator.mutation(api.posts.update, { postId, url: NEW_URL }),
      "not_found",
    );
  });

  test("does not let a creator verify through update", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedPost(t);
    const args = { postId, url: NEW_URL, isVerified: true };
    await expect(fixture.asCreator.mutation(api.posts.update, args)).rejects.toThrow(
      "Unexpected field `isVerified`",
    );
  });
});

describe("posts.verify", () => {
  test("lets an operator verify a post", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    const asOperator = await seedOperator(t, "operator");

    const post = await asOperator.mutation(api.posts.verify, { postId });

    expect(post.isVerified).toBe(true);
  });

  test("rejects the creator and the owning company", async () => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await seedPost(t);

    for (const caller of [fixture.asCreator, fixture.asCompany]) {
      await expectApiError(() => caller.mutation(api.posts.verify, { postId }), "forbidden");
    }
  });

  test("rejects a signed-out caller", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    await expectApiError(() => t.mutation(api.posts.verify, { postId }), "not_authenticated");
  });
});

describe("posts.unverify", () => {
  test("lets an operator unverify a verified post", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    const asOperator = await seedOperator(t, "operator");
    await asOperator.mutation(api.posts.verify, { postId });

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

describe("posts.updateMetrics", () => {
  test("stores metrics for server-side callers", async () => {
    const t = convexTest(schema, modules);
    const { postId } = await seedPost(t);
    const metrics = { likes: 120, comments: 14, reposts: 9, views: 48_000 };

    const post = await t.mutation(internal.posts.updateMetrics, { postId, ...metrics });

    expect(post).toMatchObject(metrics);
  });
});
