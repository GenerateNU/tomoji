/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DAY_MS } from "../../lib/time";
import { recordPostRemoval, recordPostViewSnapshot } from "../../models/earningSources";
import { createPost, replacePost, unverifyPost, verifyPost } from "../../models/posts";
import schema from "../../schema";
import { seedOneSubmission, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
const NOW = Date.UTC(2026, 10, 11, 12);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function verifiedPost(t: TestConvex) {
  const { fixture, submissionId } = await seedOneSubmission(t, "approved");
  const postId = await t.run((ctx) =>
    createPost(ctx, fixture.creatorId, {
      submissionId,
      url: "https://x.com/creator/status/1843000000000000001",
    }),
  );
  await t.run((ctx) => verifyPost(ctx, postId, { postedAt: NOW - 60_000 }));
  return { fixture, postId };
}

test.each(["before removal", "after removal"] as const)(
  "declines outside a removal cutoff do not hold earnings when received %s",
  async (order) => {
    const t = convexTest(schema, modules);
    const { postId } = await verifiedPost(t);
    vi.setSystemTime(NOW + 6 * DAY_MS);
    const removal = { postId, removedAt: NOW + 3 * DAY_MS, sourceKey: "removal" };
    const observations = [
      { observedAt: NOW - 2_000, views: 300 },
      { observedAt: NOW - 1_000, views: 100 },
      { observedAt: NOW, views: 100 },
      { observedAt: removal.removedAt, views: 200 },
      { observedAt: NOW + 4 * DAY_MS, views: 300 },
      { observedAt: NOW + 5 * DAY_MS, views: 250 },
    ];
    if (order === "after removal") await t.run((ctx) => recordPostRemoval(ctx, removal));
    const snapshots = [];
    for (const [index, observation] of observations.entries()) {
      snapshots.push(
        await t.run((ctx) =>
          recordPostViewSnapshot(ctx, { postId, ...observation, sourceKey: `view:${index}` }),
        ),
      );
    }
    if (order === "before removal") {
      expect((await t.run((ctx) => ctx.db.query("deliverableEarnings").take(1)))[0]).toMatchObject({
        variableHoldReason: "metric_count_regressed",
      });
      await t.run((ctx) => recordPostRemoval(ctx, removal));
    }
    const earnings = (await t.run((ctx) => ctx.db.query("deliverableEarnings").take(1)))[0];
    expect(earnings).not.toHaveProperty("variableHoldReason");
    expect(earnings).toMatchObject({
      startedAt: NOW,
      endsAt: NOW + 30 * DAY_MS,
      cutoffAt: removal.removedAt,
      cutoffReason: "removed",
      fixedFeeCents: 10_000,
    });
    expect(await t.run((ctx) => ctx.db.query("postViewSnapshots").take(7))).toEqual(snapshots);
    const removed = await t.run((ctx) => ctx.db.get("posts", postId));
    expect(await t.run((ctx) => recordPostRemoval(ctx, removal))).toEqual(removed);
    expect(removed).toMatchObject({ views: 250, viewsUpdatedAt: NOW + 5 * DAY_MS });
  },
);

test("an identical removal retry reconciles a stale regression hold after clock rollback", async () => {
  const t = convexTest(schema, modules);
  const { postId } = await verifiedPost(t);
  vi.setSystemTime(NOW + 6 * DAY_MS);
  for (const [day, views] of [
    [0, 100],
    [3, 200],
    [4, 300],
    [5, 250],
  ]) {
    await t.run((ctx) =>
      recordPostViewSnapshot(ctx, {
        postId,
        observedAt: NOW + day * DAY_MS,
        views,
        sourceKey: `view:${day}`,
      }),
    );
  }
  const removal = { postId, removedAt: NOW + 3 * DAY_MS, sourceKey: "removal" };
  // State left by the old removal path, which persisted the cutoff but kept the hold.
  await t.run(async (ctx) => {
    await ctx.db.patch("posts", postId, {
      removedAt: removal.removedAt,
      removalSourceKey: removal.sourceKey,
    });
    const earnings = (await ctx.db.query("deliverableEarnings").take(1))[0];
    await ctx.db.patch("deliverableEarnings", earnings._id, {
      cutoffAt: removal.removedAt,
      cutoffReason: "removed",
    });
  });
  const originalPost = await t.run((ctx) => ctx.db.get("posts", postId));
  vi.setSystemTime(NOW);
  expect(await t.run((ctx) => recordPostRemoval(ctx, removal))).toEqual(originalPost);
  expect((await t.run((ctx) => ctx.db.query("deliverableEarnings").take(1)))[0]).not.toHaveProperty(
    "variableHoldReason",
  );
});

test.each([
  {
    name: "at the cutoff",
    observations: [
      [0, 300],
      [3, 200],
    ],
  },
  {
    name: "before a rebound",
    observations: [
      [0, 100],
      [1, 300],
      [2, 250],
      [3, 400],
    ],
  },
])("removal retains a regression $name within the eligible window", async ({ observations }) => {
  const t = convexTest(schema, modules);
  const { postId } = await verifiedPost(t);
  vi.setSystemTime(NOW + 6 * DAY_MS);
  for (const [day, views] of observations) {
    await t.run((ctx) =>
      recordPostViewSnapshot(ctx, {
        postId,
        observedAt: NOW + day * DAY_MS,
        views,
        sourceKey: `view:${day}`,
      }),
    );
  }
  await t.run((ctx) =>
    recordPostRemoval(ctx, { postId, removedAt: NOW + 3 * DAY_MS, sourceKey: "removal" }),
  );
  expect((await t.run((ctx) => ctx.db.query("deliverableEarnings").take(1)))[0]).toMatchObject({
    variableHoldReason: "metric_count_regressed",
  });
});

test.each(["verification_changed", "post_replaced"] as const)(
  "removal preserves the stronger %s hold",
  async (reason) => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await verifiedPost(t);
    vi.setSystemTime(NOW + 6 * DAY_MS);
    for (const [day, views] of [
      [4, 300],
      [5, 250],
    ]) {
      await t.run((ctx) =>
        recordPostViewSnapshot(ctx, {
          postId,
          observedAt: NOW + day * DAY_MS,
          views,
          sourceKey: `view:${day}`,
        }),
      );
    }
    await t.run((ctx) => unverifyPost(ctx, postId));
    if (reason === "post_replaced") {
      await t.run((ctx) =>
        replacePost(ctx, fixture.creatorId, postId, {
          url: "https://x.com/creator/status/1843000000000000002",
        }),
      );
    }
    await t.run((ctx) =>
      recordPostRemoval(ctx, { postId, removedAt: NOW + 3 * DAY_MS, sourceKey: "removal" }),
    );
    expect((await t.run((ctx) => ctx.db.query("deliverableEarnings").take(1)))[0]).toMatchObject({
      variableHoldReason: reason,
    });
  },
);

test.each([1_000, 1_001])(
  "removal clears a hold only after inspecting the complete %i-observation history",
  async (historySize) => {
    const t = convexTest(schema, modules);
    const { postId } = await verifiedPost(t);
    vi.setSystemTime(NOW + 6 * DAY_MS);
    await t.run(async (ctx) => {
      for (let index = 0; index < historySize; index++) {
        await ctx.db.insert("postViewSnapshots", {
          postId,
          observedAt: NOW + index * 1_000,
          views: index,
          sourceKey: `history:${index}`,
          receivedAt: Date.now(),
        });
      }
    });
    for (const [day, views] of [
      [4, 3_000],
      [5, 2_000],
    ]) {
      await t.run((ctx) =>
        recordPostViewSnapshot(ctx, {
          postId,
          observedAt: NOW + day * DAY_MS,
          views,
          sourceKey: `view:${day}`,
        }),
      );
    }
    await t.run((ctx) =>
      recordPostRemoval(ctx, { postId, removedAt: NOW + 3 * DAY_MS, sourceKey: "removal" }),
    );
    const earnings = (await t.run((ctx) => ctx.db.query("deliverableEarnings").take(1)))[0];
    expect(earnings.variableHoldReason).toBe(
      historySize > 1_000 ? "metric_count_regressed" : undefined,
    );
    expect(earnings.cutoffAt).toBe(NOW + 3 * DAY_MS);
  },
);
