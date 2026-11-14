/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { internal } from "../_generated/api";
import { createPost, verifyPost } from "../models/posts";
import schema from "../schema";
import { seedAssignmentFixture, seedSubmission } from "./helpers";

const modules = import.meta.glob("../**/*.ts");
afterEach(() => vi.useRealTimers());

test("the financial settlement operation is internal and accepts no caller-supplied amount", async () => {
  const { settle } = await import("../earnings");
  // convex-test can call internal functions; registration is the public API boundary.
  expect(settle).toHaveProperty("isInternal", true);
  expect(settle).not.toHaveProperty("isPublic");
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const untrustedInput = {
    assignmentId: fixture.assignmentId,
    deliverableId: fixture.deliverableId,
    periodIndex: 0,
    amount: 999_999,
  };
  await expect(t.mutation(internal.earnings.settle, untrustedInput)).rejects.toThrow();
  expect(await t.run(async (ctx) => await ctx.db.query("payouts").collect())).toHaveLength(0);
});

test("the route validates and returns a real settlement from lifecycle-created state", async () => {
  const t = convexTest(schema, modules);
  vi.useFakeTimers({ toFake: ["Date"] });
  const startedAt = 1_800_000_000_000;
  vi.setSystemTime(startedAt);
  const fixture = await seedAssignmentFixture(t);
  const submissionId = await seedSubmission(t, fixture, "approved");
  await t.run(async (ctx) => {
    await ctx.db.patch("assignments", fixture.assignmentId, {
      fixedFeeCents: 10_000,
      cpmRateCents: 0,
      paymentCapCents: 20_000,
    });
    const postId = await createPost(ctx, fixture.creatorId, {
      submissionId,
      url: "https://x.com/creator/status/123",
    });
    await verifyPost(ctx, postId, { postedAt: startedAt - 1000 });
  });
  vi.setSystemTime(startedAt + 7 * 86_400_000);
  const result = await t.mutation(internal.earnings.settle, {
    assignmentId: fixture.assignmentId,
    deliverableId: fixture.deliverableId,
    periodIndex: 0,
  });
  expect(result.status).toBe("recorded");
  expect(result.calculationIds).toHaveLength(1);
  expect(result.payoutIds).toHaveLength(1);
  expect(
    await t.run(async (ctx) => await ctx.db.get("payouts", result.payoutIds[0])),
  ).toMatchObject({ amount: 10_000, approvalStatus: "pending" });
});
