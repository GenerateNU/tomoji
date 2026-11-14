/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { seedAssignmentFixture, seedPost, type TestConvex } from "./helpers";

const modules = import.meta.glob("../**/*.ts");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function enableSync() {
  vi.stubEnv("X_METRICS_SYNC_ENABLED", "true");
  vi.stubEnv("X_BEARER_TOKEN", "test-bearer");
}

/**
 * Verified, active posts in the sync window. `seedPost` generates ids longer
 * than X allows, so each gets a realistic one, built as text because a 19-digit
 * number is past what JavaScript stores exactly.
 */
async function seedSyncedPosts(t: TestConvex, count: number) {
  const { assignmentId } = await seedAssignmentFixture(t);
  const posts: { postId: Id<"posts">; xPostId: string }[] = [];
  for (let i = 1; i <= count; i++) {
    const postId = await seedPost(t, assignmentId);
    const xPostId = `1900000000000000${String(i).padStart(3, "0")}`;
    await t.run(async (ctx) => await ctx.db.patch("posts", postId, { xPostId }));
    posts.push({ postId, xPostId });
  }
  return posts;
}

function xPost(id: string, views: number) {
  return {
    id,
    text: "post",
    public_metrics: {
      impression_count: views,
      like_count: 38,
      reply_count: 3,
      retweet_count: 7,
      quote_count: 1,
    },
  };
}

function stubX(body: unknown, status = 200) {
  const fetch = vi.fn().mockResolvedValue(Response.json(body, { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function storedPost(t: TestConvex, postId: Id<"posts">) {
  return await t.run(async (ctx) => await ctx.db.get("posts", postId));
}

async function scheduledSyncs(t: TestConvex) {
  return await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").take(10));
}

describe("xMetrics.sync", () => {
  test("does nothing while the sync is switched off", async () => {
    const t = convexTest(schema, modules);
    const [post] = await seedSyncedPosts(t, 1);
    const fetch = stubX({ data: [] });

    await t.action(internal.xMetrics.sync, {});

    expect(fetch).not.toHaveBeenCalled();
    expect(await storedPost(t, post!.postId)).not.toHaveProperty("views");
  });

  test("stores views and engagement for each post X returns", async () => {
    enableSync();
    const t = convexTest(schema, modules);
    const [first, second] = await seedSyncedPosts(t, 2);
    const fetch = stubX({ data: [xPost(first!.xPostId, 1250), xPost(second!.xPostId, 0)] });

    await t.action(internal.xMetrics.sync, {});

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await storedPost(t, first!.postId)).toMatchObject({
      views: 1250,
      viewsUpdatedAt: Date.now(),
      likes: 38,
      comments: 3,
      reposts: 7,
      quotes: 1,
    });
    expect(await storedPost(t, second!.postId)).toMatchObject({ views: 0 });
    expect(await scheduledSyncs(t)).toEqual([]);
  });

  test("posts X leaves out keep their stored counts", async () => {
    enableSync();
    const t = convexTest(schema, modules);
    const [kept, refreshed] = await seedSyncedPosts(t, 2);
    await t.run(
      async (ctx) => await ctx.db.patch("posts", kept!.postId, { views: 900, likes: 10 }),
    );
    stubX({ data: [xPost(refreshed!.xPostId, 1250)] });

    await t.action(internal.xMetrics.sync, {});

    expect(await storedPost(t, kept!.postId)).toMatchObject({ views: 900, likes: 10 });
    expect(await storedPost(t, refreshed!.postId)).toMatchObject({ views: 1250 });
  });

  test("continues with the next page at the same cutoff", async () => {
    enableSync();
    const t = convexTest(schema, modules);
    const [first] = await seedSyncedPosts(t, 2);
    stubX({ data: [xPost(first!.xPostId, 1250)] });

    await t.action(internal.xMetrics.sync, { pageSize: 1 });

    const [next] = await scheduledSyncs(t);
    expect(next).toMatchObject({
      name: "xMetrics:sync",
      args: [{ now: Date.now(), pageSize: 1, cursor: expect.any(String) }],
    });
  });

  test("an X failure stops the run without storing or continuing", async () => {
    enableSync();
    const t = convexTest(schema, modules);
    const [post] = await seedSyncedPosts(t, 2);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    stubX({ title: "Too Many Requests" }, 429);

    await t.action(internal.xMetrics.sync, { pageSize: 1 });

    expect(await storedPost(t, post!.postId)).not.toHaveProperty("views");
    expect(await scheduledSyncs(t)).toEqual([]);
  });
});

describe("xMetrics.saveCounts", () => {
  test("skips a post replaced since it was listed", async () => {
    const t = convexTest(schema, modules);
    const [replaced, kept] = await seedSyncedPosts(t, 2);
    await t.run(async (ctx) => await ctx.db.patch("posts", replaced!.postId, { isActive: false }));

    const saved = await t.mutation(internal.xMetrics.saveCounts, {
      counts: [
        { postId: replaced!.postId, views: 10, engagement: { likes: 1 } },
        { postId: kept!.postId, views: 20, engagement: { likes: 2 } },
      ],
    });

    expect(saved).toBe(1);
    expect(await storedPost(t, replaced!.postId)).not.toHaveProperty("views");
    expect(await storedPost(t, kept!.postId)).toMatchObject({ views: 20, likes: 2 });
  });
});
