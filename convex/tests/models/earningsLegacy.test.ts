/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createPost, replacePost, verifyPost } from "../../models/posts";
import { initializePostEarnings } from "../../models/earningSources";
import schema from "../../schema";
import { seedOneSubmission, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
const NOW = Date.UTC(2026, 10, 11, 12);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function legacyPost(t: TestConvex) {
  const { fixture, submissionId } = await seedOneSubmission(t, "approved");
  // Old unverification cleared postedAt and left no record of earlier verification.
  const postId = await t.run(async (ctx) => {
    const assignment = (await ctx.db.get("assignments", fixture.assignmentId))!;
    return await ctx.db.insert("posts", {
      submissionId,
      campaignId: assignment.campaignId,
      url: "https://x.com/creator/status/1843000000000000001",
      xPostId: "1843000000000000001",
      isActive: true,
      isVerified: false,
    });
  });
  return { fixture, postId };
}

test("an already-unverified legacy post can verify without inventing an earnings window", async () => {
  const t = convexTest(schema, modules);
  const { postId } = await legacyPost(t);
  const verified = await t.run((ctx) => verifyPost(ctx, postId, { postedAt: NOW - 60_000 }));

  expect(verified).toMatchObject({ isVerified: true, earningsTimingUnknown: true });
  expect(verified.firstVerifiedAt).toBeUndefined();
  expect(await t.run((ctx) => ctx.db.query("deliverableEarnings").take(2))).toEqual([]);
  expect(await t.run((ctx) => ctx.db.get("posts", postId))).toEqual(verified);
});

test("replacing an ambiguous legacy post cannot turn it into a new earnings agreement", async () => {
  const t = convexTest(schema, modules);
  const { fixture, postId } = await legacyPost(t);
  const replacement = await t.run((ctx) =>
    replacePost(ctx, fixture.creatorId, postId, {
      url: "https://x.com/creator/status/1843000000000000002",
    }),
  );
  expect(replacement.earningsTrackingVersion).toBeUndefined();
  const verified = await t.run((ctx) => verifyPost(ctx, replacement._id, { postedAt: NOW }));

  expect(verified).toMatchObject({ isVerified: true, earningsTimingUnknown: true });
  expect(verified.firstVerifiedAt).toBeUndefined();
  expect(await t.run((ctx) => ctx.db.query("deliverableEarnings").take(2))).toEqual([]);
});

test("direct initialization cannot bypass unknown legacy history with a supplied date", async () => {
  const t = convexTest(schema, modules);
  const { postId } = await legacyPost(t);
  expect(await t.run((ctx) => initializePostEarnings(ctx, postId, NOW))).toBeNull();
  expect(await t.run((ctx) => ctx.db.get("posts", postId))).toMatchObject({
    earningsTimingUnknown: true,
  });
  expect(await t.run((ctx) => ctx.db.query("deliverableEarnings").take(2))).toEqual([]);
});

test.each([false, true])(
  "a recorded original verification time survives without the new marker (replacement: %s)",
  async (replace) => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await legacyPost(t);
    const originalStart = NOW - 10 * 86_400_000;
    await t.run((ctx) => ctx.db.patch("posts", postId, { firstVerifiedAt: originalStart }));
    const verifiedPostId = replace
      ? (
          await t.run((ctx) =>
            replacePost(ctx, fixture.creatorId, postId, {
              url: "https://x.com/creator/status/1843000000000000002",
            }),
          )
        )._id
      : postId;
    const verified = await t.run((ctx) => verifyPost(ctx, verifiedPostId, { postedAt: NOW }));

    expect(verified.firstVerifiedAt).toBe(originalStart);
    expect(verified.earningsTimingUnknown).toBeUndefined();
    const agreements = await t.run((ctx) => ctx.db.query("deliverableEarnings").take(2));
    expect(agreements).toHaveLength(1);
    expect(agreements[0]).toMatchObject({
      startedAt: originalStart,
      endsAt: originalStart + 30 * 86_400_000,
    });
  },
);

test("an existing agreement remains authoritative when a legacy post has no original timestamp", async () => {
  const t = convexTest(schema, modules);
  const { postId } = await legacyPost(t);
  const originalStart = NOW - 10 * 86_400_000;
  const original = await t.run(async (ctx) => {
    await ctx.db.patch("posts", postId, { firstVerifiedAt: originalStart });
    const agreement = await initializePostEarnings(ctx, postId, originalStart);
    await ctx.db.patch("posts", postId, { firstVerifiedAt: undefined });
    return agreement;
  });
  expect(original).not.toBeNull();
  const verified = await t.run((ctx) => verifyPost(ctx, postId, { postedAt: NOW }));

  expect(verified.firstVerifiedAt).toBe(originalStart);
  expect(verified.earningsTimingUnknown).toBeUndefined();
  expect(await t.run((ctx) => ctx.db.query("deliverableEarnings").take(2))).toEqual([original]);
});

test("a genuinely new post can be replaced before first verification and start earnings normally", async () => {
  const t = convexTest(schema, modules);
  const { fixture, submissionId } = await seedOneSubmission(t, "approved");
  const postId = await t.run((ctx) =>
    createPost(ctx, fixture.creatorId, {
      submissionId,
      url: "https://x.com/creator/status/1843000000000000001",
    }),
  );
  const replacement = await t.run((ctx) =>
    replacePost(ctx, fixture.creatorId, postId, {
      url: "https://x.com/creator/status/1843000000000000002",
    }),
  );
  const verified = await t.run((ctx) =>
    verifyPost(ctx, replacement._id, { postedAt: NOW - 60_000 }),
  );

  expect(verified.firstVerifiedAt).toBe(NOW);
  expect(verified.earningsTimingUnknown).toBeUndefined();
  const agreements = await t.run((ctx) => ctx.db.query("deliverableEarnings").take(2));
  expect(agreements).toHaveLength(1);
  expect(agreements[0]).toMatchObject({ postId: replacement._id, startedAt: NOW });
});
