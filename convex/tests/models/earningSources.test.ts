/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  createPost,
  replacePost,
  unverifyPost,
  updatePostEngagement,
  updatePostViews,
  verifyPost,
} from "../../models/posts";
import { cancelAssignment } from "../../models/assignments";
import { recordPostRemoval, recordPostViewSnapshot } from "../../models/earningSources";
import schema from "../../schema";
import { seedOneSubmission, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
const NOW = Date.UTC(2026, 10, 11, 12);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

async function fixturePost(t: TestConvex) {
  const { fixture, submissionId } = await seedOneSubmission(t, "approved");
  const postId = await t.run((ctx) =>
    createPost(ctx, fixture.creatorId, {
      submissionId,
      url: "https://x.com/creator/status/1843000000000000001",
    }),
  );
  return { fixture, postId };
}

test("live-post verification preserves its own earnings start, separate from publication", async () => {
  const t = convexTest(schema, modules);
  const { fixture, submissionId } = await seedOneSubmission(t, "approved");
  const postId = await t.run((ctx) =>
    createPost(ctx, fixture.creatorId, {
      submissionId,
      url: "https://x.com/creator/status/1843000000000000001",
    }),
  );
  const post = await t.run((ctx) => verifyPost(ctx, postId, { postedAt: NOW - 60_000 }));
  expect(post).toMatchObject({ firstVerifiedAt: NOW, postedAt: NOW - 60_000 });
  const earnings = await t.run((ctx) => ctx.db.query("deliverableEarnings").take(2));
  expect(earnings).toHaveLength(1);
  expect(earnings[0]).toMatchObject({
    assignmentId: fixture.assignmentId,
    deliverableId: fixture.deliverableId,
    postId,
    startedAt: NOW,
    endsAt: NOW + 30 * 86_400_000,
    fixedFeeCents: 10_000,
    currency: "usd",
  });
});

test("reverification and replacement retain the original agreement and hold ambiguous views", async () => {
  const t = convexTest(schema, modules);
  const { fixture, postId } = await fixturePost(t);
  await t.run((ctx) => verifyPost(ctx, postId, { postedAt: NOW - 60_000 }));
  const original = (await t.run((ctx) => ctx.db.query("deliverableEarnings").take(2)))[0];
  vi.setSystemTime(NOW + 86_400_000);
  await t.run((ctx) => unverifyPost(ctx, postId));
  await t.run((ctx) => verifyPost(ctx, postId, { postedAt: NOW - 60_000 }));
  expect((await t.run((ctx) => ctx.db.query("deliverableEarnings").take(2)))[0]).toEqual({
    ...original,
    variableHoldReason: "verification_changed",
  });
  await t.run((ctx) => unverifyPost(ctx, postId));
  const replacement = await t.run((ctx) =>
    replacePost(ctx, fixture.creatorId, postId, {
      url: "https://x.com/creator/status/1843000000000000002",
    }),
  );
  await t.run((ctx) => verifyPost(ctx, replacement._id, { postedAt: NOW }));
  expect(await t.run((ctx) => ctx.db.query("deliverableEarnings").take(2))).toEqual([
    { ...original, variableHoldReason: "post_replaced" },
  ]);
});

test("legacy verification without a timestamp cannot start a new earning window after replacement", async () => {
  const t = convexTest(schema, modules);
  const { fixture, postId } = await fixturePost(t);
  await t.run((ctx) =>
    ctx.db.patch("posts", postId, {
      isVerified: true,
      postedAt: NOW - 60_000,
      earningsTrackingVersion: undefined,
    }),
  );
  await t.run((ctx) => unverifyPost(ctx, postId));
  const replacement = await t.run((ctx) =>
    replacePost(ctx, fixture.creatorId, postId, {
      url: "https://x.com/creator/status/1843000000000000002",
    }),
  );
  const verified = await t.run((ctx) => verifyPost(ctx, replacement._id, { postedAt: NOW }));
  expect(verified.earningsTimingUnknown).toBe(true);
  expect(verified.firstVerifiedAt).toBeUndefined();
  expect(await t.run((ctx) => ctx.db.query("deliverableEarnings").take(2))).toEqual([]);
});

test("cancellation records a cutoff while retaining the earned agreement", async () => {
  const t = convexTest(schema, modules);
  const { fixture, postId } = await fixturePost(t);
  await t.run((ctx) => verifyPost(ctx, postId, { postedAt: NOW - 60_000 }));
  const original = await t.run((ctx) => ctx.db.query("deliverableEarnings").take(2));
  vi.setSystemTime(NOW + 3 * 86_400_000);
  const cancelled = await t.run(async (ctx) => {
    const assignment = (await ctx.db.get("assignments", fixture.assignmentId))!;
    return await cancelAssignment(ctx, assignment);
  });
  expect(cancelled).toMatchObject({ status: "cancelled", cancelledAt: NOW + 3 * 86_400_000 });
  expect(await t.run((ctx) => ctx.db.query("deliverableEarnings").take(2))).toEqual([
    { ...original[0], cutoffAt: cancelled.cancelledAt, cutoffReason: "cancelled" },
  ]);
});

test("view updates retain immutable evidence without engagement-only observations", async () => {
  const t = convexTest(schema, modules);
  const { postId } = await fixturePost(t);
  await t.run((ctx) => updatePostViews(ctx, postId, 100));
  vi.setSystemTime(NOW + 500);
  await t.run((ctx) => updatePostEngagement(ctx, postId, { likes: 20 }));
  expect(await t.run((ctx) => ctx.db.query("postViewSnapshots").take(2))).toHaveLength(1);
  expect(await t.run((ctx) => ctx.db.get("posts", postId))).toMatchObject({
    views: 100,
    viewsUpdatedAt: NOW,
    likes: 20,
  });
  vi.setSystemTime(NOW + 1000);
  await t.run((ctx) => updatePostViews(ctx, postId, 300));
  const snapshots = await t.run((ctx) => ctx.db.query("postViewSnapshots").take(3));
  expect(snapshots).toHaveLength(2);
  expect(snapshots[0]).toMatchObject({ postId, observedAt: NOW, views: 100 });
  expect(snapshots[1]).toMatchObject({ postId, observedAt: NOW + 1000, views: 300 });
});

test("two view updates at the same observation time cannot rewrite the view evidence", async () => {
  const t = convexTest(schema, modules);
  const { postId } = await fixturePost(t);
  await t.run((ctx) => updatePostViews(ctx, postId, 100));
  await t.run((ctx) => updatePostViews(ctx, postId, 100));
  await expect(t.run((ctx) => updatePostViews(ctx, postId, 200))).rejects.toMatchObject({
    data: { code: "conflict", reason: "view_snapshot_conflict" },
  });
  expect(await t.run((ctx) => ctx.db.get("posts", postId))).toMatchObject({ views: 100 });
  expect(await t.run((ctx) => ctx.db.query("postViewSnapshots").take(2))).toHaveLength(1);
});

test("snapshot retries are immutable and reconcile even after deletion or clock rollback", async () => {
  const t = convexTest(schema, modules);
  const { postId } = await fixturePost(t);
  const observation = { postId, observedAt: NOW, views: 100, sourceKey: "observation-1" };
  const first = await t.run((ctx) => recordPostViewSnapshot(ctx, observation));
  expect(await t.run((ctx) => recordPostViewSnapshot(ctx, observation))).toEqual(first);
  await expect(
    t.run((ctx) => recordPostViewSnapshot(ctx, { ...observation, views: 200 })),
  ).rejects.toMatchObject({ data: { code: "conflict", reason: "view_snapshot_conflict" } });
  await expect(
    t.run((ctx) => recordPostViewSnapshot(ctx, { ...observation, sourceKey: "alias" })),
  ).rejects.toMatchObject({ data: { code: "conflict", reason: "view_snapshot_time_conflict" } });
  await t.run((ctx) => ctx.db.delete("posts", postId));
  vi.setSystemTime(NOW - 1000);
  expect(await t.run((ctx) => recordPostViewSnapshot(ctx, observation))).toEqual(first);
});

test("late snapshots cannot rewind current metrics and decreasing counts retain their evidence", async () => {
  const t = convexTest(schema, modules);
  const { postId } = await fixturePost(t);
  await t.run((ctx) =>
    recordPostViewSnapshot(ctx, { postId, observedAt: NOW, views: 300, sourceKey: "new" }),
  );
  await t.run((ctx) =>
    recordPostViewSnapshot(ctx, { postId, observedAt: NOW - 1000, views: 100, sourceKey: "old" }),
  );
  expect(await t.run((ctx) => ctx.db.get("posts", postId))).toMatchObject({
    views: 300,
    viewsUpdatedAt: NOW,
  });
  vi.setSystemTime(NOW + 1000);
  const corrected = await t.run((ctx) =>
    recordPostViewSnapshot(ctx, {
      postId,
      observedAt: NOW + 1000,
      views: 250,
      sourceKey: "decrease",
    }),
  );
  expect(corrected.views).toBe(250);
  expect(await t.run((ctx) => ctx.db.query("postViewSnapshots").take(4))).toHaveLength(3);
});

test.each([
  { observedAt: NOW + 1, views: 100 },
  { observedAt: -1, views: 100 },
  { observedAt: NOW, views: -1 },
  { observedAt: NOW, views: 0.5 },
  { observedAt: NOW, views: Number.MAX_SAFE_INTEGER + 1 },
])("invalid metric evidence is rejected without a write: %j", async (fields) => {
  const t = convexTest(schema, modules);
  const { postId } = await fixturePost(t);
  await expect(
    t.run((ctx) => recordPostViewSnapshot(ctx, { postId, sourceKey: "invalid", ...fields })),
  ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "view_snapshot_invalid" } });
  expect(await t.run((ctx) => ctx.db.query("postViewSnapshots").take(1))).toEqual([]);
});

test("confirmed removal records a stable cutoff and preserves historical earnings", async () => {
  const t = convexTest(schema, modules);
  const { postId } = await fixturePost(t);
  await t.run((ctx) => verifyPost(ctx, postId, { postedAt: NOW - 60_000 }));
  vi.setSystemTime(NOW + 3 * 86_400_000);
  const evidence = { postId, removedAt: Date.now(), sourceKey: "confirmed-removal" };
  const removed = await t.run((ctx) => recordPostRemoval(ctx, evidence));
  expect(await t.run((ctx) => recordPostRemoval(ctx, evidence))).toEqual(removed);
  expect((await t.run((ctx) => ctx.db.query("deliverableEarnings").take(1)))[0]).toMatchObject({
    startedAt: NOW,
    endsAt: NOW + 30 * 86_400_000,
    cutoffAt: evidence.removedAt,
    cutoffReason: "removed",
    fixedFeeCents: 10_000,
  });
  await expect(
    t.run((ctx) => recordPostRemoval(ctx, { ...evidence, removedAt: NOW + 1 })),
  ).rejects.toMatchObject({ data: { code: "conflict", reason: "post_removal_conflict" } });
});

test("a stale cancellation call cannot move the original cutoff", async () => {
  const t = convexTest(schema, modules);
  const { fixture } = await fixturePost(t);
  const original = (await t.run((ctx) => ctx.db.get("assignments", fixture.assignmentId)))!;
  await t.run((ctx) => cancelAssignment(ctx, original));
  vi.setSystemTime(NOW + 1000);
  await expect(t.run((ctx) => cancelAssignment(ctx, original))).rejects.toMatchObject({
    data: { code: "invalid_state", reason: "assignment_not_cancellable" },
  });
  expect(await t.run((ctx) => ctx.db.get("assignments", fixture.assignmentId))).toMatchObject({
    cancelledAt: NOW,
  });
});

test.each([
  ["in order", [0, 1, 2, 3]],
  ["late lower middle observation", [0, 1, 3, 2]],
  ["late higher middle observation", [0, 2, 3, 1]],
] as const)("a decrease followed by recovery remains held: %s", async (_name, order) => {
  const t = convexTest(schema, modules);
  const { postId } = await fixturePost(t);
  await t.run((ctx) => verifyPost(ctx, postId, { postedAt: NOW - 60_000 }));
  vi.setSystemTime(NOW + 7 * 86_400_000);
  const observations = [
    { observedAt: NOW, views: 100 },
    { observedAt: NOW + 3 * 86_400_000, views: 300 },
    { observedAt: NOW + 4 * 86_400_000, views: 250 },
    { observedAt: NOW + 7 * 86_400_000, views: 400 },
  ];
  for (const index of order) {
    await t.run((ctx) =>
      recordPostViewSnapshot(ctx, {
        postId,
        ...observations[index],
        sourceKey: `observation:${index}`,
      }),
    );
  }
  expect((await t.run((ctx) => ctx.db.query("deliverableEarnings").take(1)))[0]).toMatchObject({
    variableHoldReason: "metric_count_regressed",
  });
  expect(await t.run((ctx) => ctx.db.query("postViewSnapshots").take(5))).toHaveLength(4);
  expect(await t.run((ctx) => ctx.db.get("posts", postId))).toMatchObject({ views: 400 });
});

test.each(["before verification", "after window", "after removal", "after cancellation"] as const)(
  "declines wholly %s do not hold eligible earnings",
  async (kind) => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await fixturePost(t);
    await t.run((ctx) => verifyPost(ctx, postId, { postedAt: NOW - 60_000 }));
    vi.setSystemTime(NOW + 32 * 86_400_000);
    if (kind === "after removal") {
      await t.run((ctx) =>
        recordPostRemoval(ctx, { postId, removedAt: NOW + 3 * 86_400_000, sourceKey: "removed" }),
      );
    }
    if (kind === "after cancellation") {
      vi.setSystemTime(NOW + 3 * 86_400_000);
      await t.run(async (ctx) =>
        cancelAssignment(ctx, (await ctx.db.get("assignments", fixture.assignmentId))!),
      );
      vi.setSystemTime(NOW + 32 * 86_400_000);
    }
    const times =
      kind === "before verification"
        ? [NOW - 2000, NOW - 1000]
        : kind === "after window"
          ? [NOW + 31 * 86_400_000, NOW + 32 * 86_400_000]
          : [NOW + 4 * 86_400_000, NOW + 5 * 86_400_000];
    await t.run((ctx) =>
      recordPostViewSnapshot(ctx, {
        postId,
        observedAt: times[0],
        views: 300,
        sourceKey: "higher",
      }),
    );
    await t.run((ctx) =>
      recordPostViewSnapshot(ctx, { postId, observedAt: times[1], views: 100, sourceKey: "lower" }),
    );
    expect(
      (await t.run((ctx) => ctx.db.query("deliverableEarnings").take(1)))[0],
    ).not.toHaveProperty("variableHoldReason");
  },
);

test("metric regression preserves an existing verification-attribution hold", async () => {
  const t = convexTest(schema, modules);
  const { postId } = await fixturePost(t);
  await t.run((ctx) => verifyPost(ctx, postId, { postedAt: NOW - 60_000 }));
  await t.run((ctx) => unverifyPost(ctx, postId));
  vi.setSystemTime(NOW + 1000);
  await t.run((ctx) =>
    recordPostViewSnapshot(ctx, { postId, observedAt: NOW, views: 300, sourceKey: "higher" }),
  );
  await t.run((ctx) =>
    recordPostViewSnapshot(ctx, { postId, observedAt: NOW + 1000, views: 100, sourceKey: "lower" }),
  );
  expect((await t.run((ctx) => ctx.db.query("deliverableEarnings").take(1)))[0]).toMatchObject({
    variableHoldReason: "verification_changed",
  });
});
