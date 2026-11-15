/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api, internal } from "../_generated/api";
import schema from "../schema";
import { seedOneSubmission, seedOperator, type TestConvex } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

async function seedPost(t: TestConvex) {
  const { fixture, submissionId } = await seedOneSubmission(t, "approved");
  const postId = await fixture.asCreator.mutation(api.posts.create, {
    submissionId,
    url: "https://x.com/creator/status/1843000000000000001",
  });
  return { fixture, postId };
}

function expectPublicPost(post: object) {
  for (const field of [
    "earningsTrackingVersion",
    "earningsTimingUnknown",
    "removalSourceKey",
    "captionCheckStartedAt",
  ]) {
    expect(post).not.toHaveProperty(field);
  }
}

test("post reads retain visible lifecycle fields but omit internal bookkeeping", async () => {
  const t = convexTest(schema, modules);
  const { fixture, postId } = await seedPost(t);
  const asOperator = await seedOperator(t, "post-view-operator");
  const now = Date.now();
  const internalFields = {
    earningsTrackingVersion: 1 as const,
    earningsTimingUnknown: true,
    removalSourceKey: "provider-removal-evidence",
    captionCheckStartedAt: now,
  };
  const visibleFields = {
    removedAt: now,
    firstVerifiedAt: now - 1000,
    captionCheck: "match" as const,
  };
  await t.run((ctx) => ctx.db.patch("posts", postId, { ...internalFields, ...visibleFields }));

  for (const caller of [fixture.asCreator, fixture.asCompany, asOperator]) {
    const post = await caller.query(api.posts.get, { postId });
    expect(post).toMatchObject({ _id: postId, ...visibleFields });
    expectPublicPost(post);
    const page = await caller.query(api.posts.list, {
      assignmentId: fixture.assignmentId,
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page.page).toHaveLength(1);
    expect(page.page[0]).toMatchObject({ _id: postId, ...visibleFields });
    expectPublicPost(page.page[0]);
  }
  expect(await t.run((ctx) => ctx.db.get("posts", postId))).toMatchObject(internalFields);
  expect(await t.mutation(internal.posts.updateEngagement, { postId, likes: 2 })).toMatchObject(
    internalFields,
  );
});

test("verification and replacement responses omit internal earnings state", async () => {
  const t = convexTest(schema, modules);
  const { fixture, postId } = await seedPost(t);
  const asOperator = await seedOperator(t, "post-mutation-operator");
  const verified = await asOperator.mutation(api.posts.verify, { postId, postedAt: Date.now() });
  expect(verified).toMatchObject({ isVerified: true });
  expectPublicPost(verified);
  const unverified = await asOperator.mutation(api.posts.unverify, { postId });
  expect(unverified).toMatchObject({ isVerified: false, captionCheck: "manualReview" });
  expectPublicPost(unverified);
  const replacement = await fixture.asCreator.mutation(api.posts.replace, {
    postId,
    url: "https://x.com/creator/status/1843000000000000002",
  });
  expectPublicPost(replacement);
  expect(await t.run((ctx) => ctx.db.get("posts", replacement._id))).toMatchObject({
    earningsTrackingVersion: 1,
    firstVerifiedAt: verified.firstVerifiedAt,
  });
});
