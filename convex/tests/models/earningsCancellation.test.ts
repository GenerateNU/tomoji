/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { DAY_MS } from "../../lib/time";
import { cancelAssignment } from "../../models/assignments";
import { MAX_DELIVERABLES } from "../../models/deliverableDrafts";
import { recordPostRemoval } from "../../models/earningSources";
import { createPost, verifyPost } from "../../models/posts";
import schema from "../../schema";
import { seedDeliverable, seedOneSubmission, seedSubmission, type TestConvex } from "../helpers";

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
  await t.run((ctx) => verifyPost(ctx, postId, { postedAt: NOW - 1000 }));
  return { fixture, postId };
}

test.each([
  {
    name: "an existing earlier removal",
    removedDay: 2,
    removalFirst: true,
    cutoffDay: 2,
    reason: "removed",
  },
  {
    name: "a subsequently reported earlier removal",
    removedDay: 2,
    removalFirst: false,
    cutoffDay: 2,
    reason: "removed",
  },
  {
    name: "a later removal",
    removedDay: 4,
    removalFirst: false,
    cutoffDay: 3,
    reason: "cancelled",
  },
  {
    name: "a removal at the same cutoff",
    removedDay: 3,
    removalFirst: false,
    cutoffDay: 3,
    reason: "cancelled",
  },
])(
  "cancellation preserves the earliest cutoff with $name",
  async ({ removedDay, removalFirst, cutoffDay, reason }) => {
    const t = convexTest(schema, modules);
    const { fixture, postId } = await verifiedPost(t);
    const removal = { postId, removedAt: NOW + removedDay * DAY_MS, sourceKey: "removal" };
    vi.setSystemTime(NOW + 3 * DAY_MS);
    if (removalFirst) await t.run((ctx) => recordPostRemoval(ctx, removal));
    await t.run(async (ctx) =>
      cancelAssignment(ctx, (await ctx.db.get("assignments", fixture.assignmentId))!),
    );
    if (!removalFirst) {
      vi.setSystemTime(NOW + 5 * DAY_MS);
      await t.run((ctx) => recordPostRemoval(ctx, removal));
    }
    expect((await t.run((ctx) => ctx.db.query("deliverableEarnings").take(1)))[0]).toMatchObject({
      startedAt: NOW,
      endsAt: NOW + 30 * DAY_MS,
      fixedFeeCents: 10000,
      cutoffAt: NOW + cutoffDay * DAY_MS,
      cutoffReason: reason,
    });
  },
);

test.each([MAX_DELIVERABLES, MAX_DELIVERABLES + 1])(
  "cancellation updates all %i agreements or rolls back",
  async (count) => {
    const t = convexTest(schema, modules);
    const { fixture } = await verifiedPost(t);
    for (let index = 1; index < count; index++) {
      const deliverableId = await seedDeliverable(t, fixture);
      const submissionId = await seedSubmission(t, { ...fixture, deliverableId }, "approved");
      const postId = await t.run((ctx) =>
        createPost(ctx, fixture.creatorId, {
          submissionId,
          url: `https://x.com/creator/status/${1843000000000000001n + BigInt(index)}`,
        }),
      );
      await t.run((ctx) => verifyPost(ctx, postId, { postedAt: NOW - 1000 }));
    }
    const before = await t.run(async (ctx) => {
      const assignment = (await ctx.db.get("assignments", fixture.assignmentId))!;
      return {
        assignment,
        agreements: await ctx.db.query("deliverableEarnings").take(count + 1),
        opportunity: await ctx.db.get("opportunities", assignment.opportunityId),
      };
    });
    vi.setSystemTime(NOW + 3 * DAY_MS);
    const cancel = () => t.run((ctx) => cancelAssignment(ctx, before.assignment));
    if (count > MAX_DELIVERABLES) {
      await expect(cancel()).rejects.toMatchObject({
        data: { code: "conflict", reason: "earning_agreement_assignment_limit" },
      });
      expect(
        await t.run(async (ctx) => ({
          assignment: await ctx.db.get("assignments", fixture.assignmentId),
          agreements: await ctx.db.query("deliverableEarnings").take(count + 1),
          opportunity: await ctx.db.get("opportunities", before.assignment.opportunityId),
        })),
      ).toEqual(before);
    } else {
      await cancel();
      const agreements = await t.run((ctx) => ctx.db.query("deliverableEarnings").take(count + 1));
      expect(agreements).toHaveLength(count);
      for (const agreement of agreements) {
        expect(agreement).toMatchObject({ cutoffAt: NOW + 3 * DAY_MS, cutoffReason: "cancelled" });
      }
      vi.setSystemTime(NOW + 4 * DAY_MS);
      await expect(cancel()).rejects.toMatchObject({
        data: { reason: "assignment_not_cancellable" },
      });
      expect(await t.run((ctx) => ctx.db.query("deliverableEarnings").take(count + 1))).toEqual(
        agreements,
      );
    }
  },
);
