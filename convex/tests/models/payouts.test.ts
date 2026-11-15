/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { ResourceViewer } from "../../lib/authz";
import {
  approvePayout,
  autoApprovePayouts,
  createPayout,
  listPayouts,
  requirePayout,
  type PayoutCreate,
  type PayoutViewer,
} from "../../models/payouts";
import { createPost } from "../../models/posts";
import { resolveDispute } from "../../models/disputes";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignment,
  seedAssignmentFixture,
  seedCreatorId,
  seedDispute,
  seedOpportunity,
  seedPayout,
  seedPost,
  seedSubmission,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
const firstPage = { numItems: 10, cursor: null };

afterEach(() => vi.useRealTimers());

const finalizedEarning = { sourceKey: "fixed-fee", amount: 10_000, currency: "usd" };

describe("payout approval", () => {
  test("company approval records its actor and leaves the amount, deadline, and payment status intact", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t, {}, "admin");
    const payoutId = await seedPayout(t, fixture.assignmentId);
    const before = (await t.run(async (ctx) => await ctx.db.get("payouts", payoutId)))!;
    vi.useFakeTimers({ toFake: ["Date"] });
    const now = before.reviewRequestedAt + 1000;
    vi.setSystemTime(now);

    const approved = await t.run(
      async (ctx) => await approvePayout(ctx, fixture.membership, payoutId),
    );
    expect(approved).toMatchObject({
      _id: payoutId,
      amount: before.amount,
      approvalDueAt: before.approvalDueAt,
      approvalStatus: "approved",
      approvalSource: "company",
      approvedAt: now,
      paymentStatus: "notStarted",
    });
    expect(approved).not.toHaveProperty("sourceKey");
    expect(approved).not.toHaveProperty("approvedBy");
    expect(await t.run(async (ctx) => await ctx.db.get("payouts", payoutId))).toEqual({
      ...before,
      approvalStatus: "approved",
      approvalSource: "company",
      approvedAt: now,
      approvedBy: fixture.membership.userId,
    });
  });

  test("all open assignment disputes hold every pending payout until resolved without changing deadlines", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t, {}, "admin");
    const firstId = await seedPayout(t, fixture.assignmentId, { approvalDueAt: Date.now() - 1000 });
    const secondId = await seedPayout(t, fixture.assignmentId, { approvalDueAt: Date.now() - 500 });
    const before = await t.run(async (ctx) => await ctx.db.query("payouts").take(3));
    const disputes = [await seedDispute(t, fixture), await seedDispute(t, fixture)];
    await expectApiError(
      () => t.run(async (ctx) => await approvePayout(ctx, fixture.membership, firstId)),
      "invalid_state",
      "payout_disputed",
    );
    expect(await t.run(async (ctx) => await autoApprovePayouts(ctx))).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.query("payouts").take(3))).toEqual(before);

    await t.run(
      async (ctx) =>
        await resolveDispute(
          ctx,
          {
            role: "creator",
            creatorId: fixture.creatorId,
          },
          fixture.creatorUserId,
          disputes[0],
          { outcome: "withdrawn" },
        ),
    );
    await t.run(async (ctx) => await autoApprovePayouts(ctx));
    await expectApiError(
      () => t.run(async (ctx) => await approvePayout(ctx, fixture.membership, secondId)),
      "invalid_state",
      "payout_disputed",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("payouts").take(3))).toEqual(before);

    await t.run(
      async (ctx) =>
        await resolveDispute(
          ctx,
          {
            role: "creator",
            creatorId: fixture.creatorId,
          },
          fixture.creatorUserId,
          disputes[1],
          { outcome: "withdrawn" },
        ),
    );
    await t.run(async (ctx) => await autoApprovePayouts(ctx));
    for (const original of before) {
      expect(await t.run(async (ctx) => await ctx.db.get("payouts", original._id))).toMatchObject({
        approvalStatus: "approved",
        approvalSource: "automatic",
        paymentStatus: "notStarted",
        approvalDueAt: original.approvalDueAt,
        reviewRequestedAt: original.reviewRequestedAt,
      });
    }
  });

  test.each([-1, 0, 1])(
    "automatic approval respects the deadline at offset %s ms",
    async (offset) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignmentFixture(t);
      const dueAt = Date.now() + 1000;
      const payoutId = await seedPayout(t, fixture.assignmentId, { approvalDueAt: dueAt });
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(dueAt + offset);
      expect(await t.run(async (ctx) => await autoApprovePayouts(ctx))).toBeNull();
      const stored = (await t.run(async (ctx) => await ctx.db.get("payouts", payoutId)))!;
      expect(stored.approvalStatus).toBe(offset < 0 ? "pending" : "approved");
      expect(stored.approvalDueAt).toBe(dueAt);
      if (offset >= 0) {
        expect(stored.approvedAt).toBe(dueAt + offset);
        expect(stored.approvalSource).toBe("automatic");
      }
      expect(stored).not.toHaveProperty("approvedBy");
      expect(stored.paymentStatus).toBe("notStarted");
    },
  );

  test("resolving a dispute before the original deadline does not approve early or restart the clock", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const dueAt = Date.now() + 10_000;
    const payoutId = await seedPayout(t, fixture.assignmentId, { approvalDueAt: dueAt });
    const disputeId = await seedDispute(t, fixture);
    await t.run(
      async (ctx) =>
        await resolveDispute(
          ctx,
          {
            role: "creator",
            creatorId: fixture.creatorId,
          },
          fixture.creatorUserId,
          disputeId,
          { outcome: "withdrawn" },
        ),
    );

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(dueAt - 1);
    await t.run(async (ctx) => await autoApprovePayouts(ctx));
    expect(await t.run(async (ctx) => await ctx.db.get("payouts", payoutId))).toMatchObject({
      approvalStatus: "pending",
      approvalDueAt: dueAt,
    });
    vi.setSystemTime(dueAt);
    await t.run(async (ctx) => await autoApprovePayouts(ctx));
    expect(await t.run(async (ctx) => await ctx.db.get("payouts", payoutId))).toMatchObject({
      approvalStatus: "approved",
      approvalDueAt: dueAt,
      approvedAt: dueAt,
    });
  });

  test.each(["company", "automatic"] as const)(
    "the first %s approval wins across subsequent manual and automatic attempts",
    async (source) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignmentFixture(t, {}, "admin");
      const payoutId = await seedPayout(t, fixture.assignmentId, { approvalDueAt: Date.now() - 1 });
      await t.run(async (ctx) =>
        source === "company"
          ? await approvePayout(ctx, fixture.membership, payoutId)
          : await autoApprovePayouts(ctx),
      );
      const original = await t.run(async (ctx) => {
        await ctx.db.patch("payouts", payoutId, { paymentStatus: "queued" });
        return (await ctx.db.get("payouts", payoutId))!;
      });
      // A later dispute must not erase approval history. Future transfers must
      // independently check current disputes before sending money.
      await seedDispute(t, fixture);
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(original.approvedAt! + 5000);
      await t.run(async (ctx) => await approvePayout(ctx, fixture.membership, payoutId));
      await t.run(async (ctx) => await autoApprovePayouts(ctx));
      expect(await t.run(async (ctx) => await ctx.db.get("payouts", payoutId))).toEqual(original);
      expect(original.approvalSource).toBe(source);
    },
  );

  test.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER])(
    "rejects an invalid or future sweep cutoff %s",
    async (cutoff) => {
      const t = convexTest(schema, modules);
      await expectApiError(
        () => t.run(async (ctx) => await autoApprovePayouts(ctx, { cursor: "unused", cutoff })),
        "invalid_state",
        "approval_cutoff_invalid",
      );
    },
  );
});

test("creates a finalized payout with assignment ownership and exactly 72 hours for review", async () => {
  // An off-grid instant across the US DST change: the deadline is elapsed time.
  vi.useFakeTimers();
  const now = Date.parse("2026-10-31T12:17:23.456Z");
  vi.setSystemTime(now);
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const postId = await seedPost(t, fixture.assignmentId);
  const payout = await t.run(
    async (ctx) =>
      await createPayout(ctx, {
        assignmentId: fixture.assignmentId,
        postId,
        sourceKey: "fixed-fee",
        amount: 10_000,
        currency: "usd",
      }),
  );
  const assignment = await t.run(
    async (ctx) => await ctx.db.get("assignments", fixture.assignmentId),
  );
  expect(payout).toMatchObject({
    assignmentId: fixture.assignmentId,
    postId,
    creatorId: fixture.creatorId,
    companyId: fixture.membership.companyId,
    campaignId: assignment?.campaignId,
    sourceKey: "fixed-fee",
    amount: 10_000,
    currency: "usd",
    reviewRequestedAt: now,
    approvalDueAt: now + 259_200_000,
    approvalStatus: "pending",
    paymentStatus: "notStarted",
  });
  expect(await t.run(async (ctx) => await ctx.db.get("payouts", payout._id))).toEqual(payout);
  expect(payout).not.toHaveProperty("approvedAt");
  expect(payout).not.toHaveProperty("transferredAt");
});

test.each([0, -1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "rejects invalid payout amount %s without writing a payout",
  async (amount) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const postId = await seedPost(t, fixture.assignmentId);
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await createPayout(ctx, {
              ...finalizedEarning,
              assignmentId: fixture.assignmentId,
              postId,
              amount,
            }),
        ),
      "invalid_state",
      "amount_invalid",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("payouts").take(1))).toEqual([]);
  },
);

test.each([
  [{ sourceKey: " \n " }, "sourceKey_blank"],
  [{ currency: "" }, "currency_invalid"],
  [{ currency: "US" }, "currency_invalid"],
  [{ currency: "USDD" }, "currency_invalid"],
  [{ currency: "u$d" }, "currency_invalid"],
  [{ earningPeriod: { startsAt: -1, endsAt: 2000 } }, "earning_period_invalid"],
  [{ earningPeriod: { startsAt: 1000, endsAt: 1000 } }, "earning_period_invalid"],
  [{ earningPeriod: { startsAt: 2000, endsAt: 1000 } }, "earning_period_invalid"],
  [{ earningPeriod: { startsAt: 1.5, endsAt: 2000 } }, "earning_period_invalid"],
  [{ earningPeriod: { startsAt: 1000, endsAt: Infinity } }, "earning_period_invalid"],
  [{ earningPeriod: { startsAt: NaN, endsAt: 2000 } }, "earning_period_invalid"],
  [{ earningPeriod: { startsAt: 1000, endsAt: 5001 } }, "earning_period_invalid"],
] satisfies [Partial<PayoutCreate>, string][])(
  "rejects invalid finalized earning input %j",
  async (overrides, reason) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const postId = await seedPost(t, fixture.assignmentId);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(5000);
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await createPayout(ctx, {
              ...finalizedEarning,
              assignmentId: fixture.assignmentId,
              postId,
              ...overrides,
            }),
        ),
      "invalid_state",
      reason,
    );
    expect(await t.run(async (ctx) => await ctx.db.query("payouts").take(1))).toEqual([]);
  },
);

test("normalizes currency and source key and returns the original payout on a later retry", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const postId = await seedPost(t, fixture.assignmentId);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(5000);
  const args = {
    ...finalizedEarning,
    assignmentId: fixture.assignmentId,
    postId,
    earningPeriod: { startsAt: 0, endsAt: 5000 },
  };
  const first = await t.run(
    async (ctx) =>
      await createPayout(ctx, {
        ...args,
        sourceKey: " fixed-fee ",
        currency: " USD ",
      }),
  );
  expect(first.currency).toBe("usd");
  expect(first.sourceKey).toBe("fixed-fee");
  vi.setSystemTime(86_405_000);
  const retry = await t.run(async (ctx) => await createPayout(ctx, args));
  expect(retry).toEqual(first);
  expect(await t.run(async (ctx) => await ctx.db.query("payouts").take(2))).toEqual([first]);
});

test("identical retries survive clock rollback while new future earnings are rejected", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const postId = await seedPost(t, fixture.assignmentId);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(5000);
  const args = {
    ...finalizedEarning,
    assignmentId: fixture.assignmentId,
    postId,
    earningPeriod: { startsAt: 0, endsAt: 5000 },
  };
  const first = await t.run(async (ctx) => await createPayout(ctx, args));

  vi.setSystemTime(4999);
  expect(await t.run(async (ctx) => await createPayout(ctx, args))).toEqual(first);
  await expectApiError(
    () => t.run(async (ctx) => await createPayout(ctx, { ...args, sourceKey: "new-earning" })),
    "invalid_state",
    "earning_period_invalid",
  );
  expect(await t.run(async (ctx) => await ctx.db.query("payouts").take(2))).toEqual([first]);
});

test.each([
  { amount: 20_000 },
  { currency: "eur" },
  { earningPeriod: undefined },
  { earningPeriod: { startsAt: 0, endsAt: 2000 } },
  { earningPeriod: { startsAt: 1000, endsAt: 3000 } },
] satisfies Partial<PayoutCreate>[])(
  "rejects conflicting retries %j without changing the payout",
  async (overrides) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const postId = await seedPost(t, fixture.assignmentId);
    const args = {
      ...finalizedEarning,
      assignmentId: fixture.assignmentId,
      postId,
      earningPeriod: { startsAt: 1000, endsAt: 2000 },
    };
    const first = await t.run(async (ctx) => await createPayout(ctx, args));
    await expectApiError(
      () => t.run(async (ctx) => await createPayout(ctx, { ...args, ...overrides })),
      "conflict",
      "payout_source_conflict",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("payouts").take(2))).toEqual([first]);
  },
);

test("different earnings create multiple payouts and different assignments can reuse source keys", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const postId = await seedPost(t, fixture.assignmentId);
  const assignment = await t.run(
    async (ctx) => await ctx.db.get("assignments", fixture.assignmentId),
  );
  const otherAssignmentId = await seedAssignment(t, {
    opportunityId: assignment!.opportunityId,
    creatorId: await seedCreatorId(t, "other-earner"),
  });
  const otherPostId = await seedPost(t, otherAssignmentId);
  const first = await t.run(
    async (ctx) =>
      await createPayout(ctx, {
        ...finalizedEarning,
        assignmentId: fixture.assignmentId,
        postId,
      }),
  );
  const next = await t.run(
    async (ctx) =>
      await createPayout(ctx, {
        ...finalizedEarning,
        assignmentId: fixture.assignmentId,
        postId,
        sourceKey: "view-period-1",
      }),
  );
  const other = await t.run(
    async (ctx) =>
      await createPayout(ctx, {
        ...finalizedEarning,
        assignmentId: otherAssignmentId,
        postId: otherPostId,
      }),
  );
  expect(new Set([first._id, next._id, other._id]).size).toBe(3);
});

test("retries reconcile after assignment deletion without resetting approval or payment progress", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const postId = await seedPost(t, fixture.assignmentId);
  const args = { ...finalizedEarning, assignmentId: fixture.assignmentId, postId };
  const first = await t.run(async (ctx) => await createPayout(ctx, args));
  const progressed = await t.run(async (ctx) => {
    await ctx.db.patch("payouts", first._id, {
      approvalStatus: "approved",
      approvedAt: Date.now(),
      approvalSource: "company",
      approvedBy: fixture.membership.userId,
      paymentStatus: "transferred",
      transferredAt: Date.now(),
    });
    await ctx.db.delete("assignments", fixture.assignmentId);
    return await ctx.db.get("payouts", first._id);
  });
  expect(await t.run(async (ctx) => await createPayout(ctx, args))).toEqual(progressed);
  await expectApiError(
    () => t.run(async (ctx) => await createPayout(ctx, { ...args, sourceKey: "new-earning" })),
    "not_found",
  );
  expect(await t.run(async (ctx) => await ctx.db.query("payouts").take(2))).toEqual([progressed]);
});

test.each(["missing post", "missing submission", "different assignment"] as const)(
  "rejects an unrelated post: %s",
  async (scenario) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const submissionId = await seedSubmission(t, fixture, "approved");
    const postId = await t.run(
      async (ctx) =>
        await createPost(ctx, fixture.creatorId, {
          submissionId,
          url: "https://x.com/creator/status/1234",
        }),
    );
    let assignmentId = fixture.assignmentId;
    if (scenario === "missing post") {
      await t.run(async (ctx) => await ctx.db.delete("posts", postId));
    } else if (scenario === "missing submission") {
      await t.run(async (ctx) => await ctx.db.delete("submissions", submissionId));
    } else {
      const assignment = await t.run(async (ctx) => await ctx.db.get("assignments", assignmentId));
      // The post has the same campaign, but a different assignment/creator.
      assignmentId = await seedAssignment(t, {
        opportunityId: assignment!.opportunityId,
        creatorId: await seedCreatorId(t, "other-post-owner"),
      });
    }
    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await createPayout(ctx, {
              ...finalizedEarning,
              assignmentId,
              postId,
            }),
        ),
      scenario === "different assignment" ? "invalid_state" : "not_found",
    );
    expect(await t.run(async (ctx) => await ctx.db.query("payouts").take(1))).toEqual([]);
  },
);

test("post context is immutable and identical retries work after the post disappears", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const submissionId = await seedSubmission(t, fixture, "approved");
  const postId = await t.run(
    async (ctx) =>
      await createPost(ctx, fixture.creatorId, {
        submissionId,
        url: "https://x.com/creator/status/1234",
      }),
  );
  const args = { ...finalizedEarning, assignmentId: fixture.assignmentId, postId };
  const first = await t.run(async (ctx) => await createPayout(ctx, args));
  const otherPostId = await seedPost(t, fixture.assignmentId);
  await expectApiError(
    () => t.run(async (ctx) => await createPayout(ctx, { ...args, postId: otherPostId })),
    "conflict",
    "payout_source_conflict",
  );
  await t.run(async (ctx) => await ctx.db.delete("posts", postId));
  expect(await t.run(async (ctx) => await createPayout(ctx, args))).toEqual(first);
});

test("creation still records finalized earnings for completed work after a campaign closes", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t, { status: "completed" });
  const postId = await seedPost(t, fixture.assignmentId);
  await t.run(async (ctx) => {
    const assignment = (await ctx.db.get("assignments", fixture.assignmentId))!;
    await ctx.db.patch("campaigns", assignment.campaignId, { status: "closed" });
    await ctx.db.patch("opportunities", assignment.opportunityId, { status: "closed" });
  });
  const payout = await t.run(
    async (ctx) =>
      await createPayout(ctx, {
        ...finalizedEarning,
        assignmentId: fixture.assignmentId,
        postId,
      }),
  );
  expect(payout.assignmentId).toBe(fixture.assignmentId);
  expect(payout.approvalStatus).toBe("pending");
});

test("a payout cannot lose its required post reference", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const payoutId = await seedPayout(t, fixture.assignmentId);

  await expect(
    t.run(async (ctx) => {
      await ctx.db.patch("payouts", payoutId, { postId: undefined });
    }),
  ).rejects.toThrow("Missing required field `postId`");
});

/** Two creators across two companies, including shared-creator and shared-company cases. */
async function seedReadScenario(t: TestConvex) {
  const fixture = await seedAssignmentFixture(t);
  const assignment = await t.run(
    async (ctx) => await ctx.db.get("assignments", fixture.assignmentId),
  );
  if (assignment === null) throw new Error("expected seeded assignment");
  const otherCreatorId = await seedCreatorId(t, "other-creator");
  const companyPeerAssignmentId = await seedAssignment(t, {
    opportunityId: assignment.opportunityId,
    creatorId: otherCreatorId,
  });
  const otherCompany = await seedOpportunity(t, {
    subject: "other-company",
    orgId: "org_other_company",
  });
  const creatorPeerAssignmentId = await seedAssignment(t, {
    opportunityId: otherCompany.opportunityId,
    creatorId: fixture.creatorId,
  });
  const foreignAssignmentId = await seedAssignment(t, {
    opportunityId: otherCompany.opportunityId,
    creatorId: otherCreatorId,
  });
  const own = await seedPayout(t, fixture.assignmentId, {
    reviewRequestedAt: 3000,
    approvalStatus: "approved",
  });
  const creatorPeer = await seedPayout(t, creatorPeerAssignmentId, { reviewRequestedAt: 1000 });
  const companyPeer = await seedPayout(t, companyPeerAssignmentId, { reviewRequestedAt: 2000 });
  const foreign = await seedPayout(t, foreignAssignmentId, {
    reviewRequestedAt: 4000,
    approvalStatus: "approved",
  });
  const viewers: Record<"creator" | "company" | "operator", ResourceViewer> = {
    creator: { role: "creator", creatorId: fixture.creatorId },
    company: { role: "company", companyId: fixture.membership.companyId },
    operator: { role: "operator" },
  };
  return {
    fixture,
    assignment,
    otherCompany,
    foreignAssignmentId,
    own,
    creatorPeer,
    companyPeer,
    foreign,
    viewers,
  };
}

test("payout history exposes stored deliverable identity without changing the obligation", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const payoutId = await seedPayout(t, fixture.assignmentId, {
    deliverableId: fixture.deliverableId,
  });
  const before = await t.run((ctx) => ctx.db.get("payouts", payoutId));
  const viewer: ResourceViewer = { role: "creator", creatorId: fixture.creatorId };
  const payout = await t.run((ctx) => requirePayout(ctx, viewer, payoutId));
  const page = await t.run((ctx) => listPayouts(ctx, viewer, { paginationOpts: firstPage }));
  expect(payout).toHaveProperty("deliverableId", fixture.deliverableId);
  expect(page.page).toEqual([payout]);
  expect(await t.run((ctx) => ctx.db.get("payouts", payoutId))).toEqual(before);
});

test("the creator can read payout history after its assignment and post are removed", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const postId = await seedPost(t, fixture.assignmentId);
  const payoutId = await seedPayout(t, fixture.assignmentId, { postId });
  await t.run(async (ctx) => {
    await ctx.db.delete("assignments", fixture.assignmentId);
    await ctx.db.delete("posts", postId);
  });

  const payout = await t.run(
    async (ctx) =>
      await requirePayout(ctx, { role: "creator", creatorId: fixture.creatorId }, payoutId),
  );

  expect(payout).toMatchObject({
    _id: payoutId,
    assignmentId: fixture.assignmentId,
    postId,
    creatorId: fixture.creatorId,
    companyId: fixture.membership.companyId,
    amount: 10_000,
    currency: "usd",
    approvalStatus: "pending",
    paymentStatus: "notStarted",
  });
  expect(payout).not.toHaveProperty("sourceKey");
  expect(payout).not.toHaveProperty("approvedBy");
});

test.each([true, false])(
  "deleted parents preserve history and dispute holds with stored deliverable identity: %s",
  async (hasDeliverableId) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t, {}, "admin");
    const payoutId = await seedPayout(t, fixture.assignmentId, {
      ...(hasDeliverableId ? { deliverableId: fixture.deliverableId } : {}),
    });
    await seedDispute(t, fixture);
    const before = (await t.run((ctx) => ctx.db.get("payouts", payoutId)))!;
    await t.run(async (ctx) => {
      const post = (await ctx.db.get("posts", before.postId))!;
      await ctx.db.delete("submissions", post.submissionId);
      await ctx.db.delete("posts", before.postId);
      await ctx.db.delete("deliverables", fixture.deliverableId);
      await ctx.db.delete("assignments", fixture.assignmentId);
      await ctx.db.delete("campaigns", before.campaignId);
    });
    const viewer: PayoutViewer = {
      role: "company",
      companyId: before.companyId,
      companyRole: "admin",
    };
    const payout = await t.run((ctx) => requirePayout(ctx, viewer, payoutId));
    const result = await t.run((ctx) =>
      listPayouts(ctx, viewer, {
        assignmentId: fixture.assignmentId,
        campaignId: before.campaignId,
        paginationOpts: firstPage,
      }),
    );
    expect(result.page).toEqual([payout]);
    expect(payout.review).toEqual({ hasOpenDispute: true, canApprove: false });
    if (hasDeliverableId) expect(payout.deliverableId).toBe(fixture.deliverableId);
    else expect(payout).not.toHaveProperty("deliverableId");
    expect(await t.run((ctx) => ctx.db.get("payouts", payoutId))).toEqual(before);
  },
);

test("legacy history does not infer a missing deliverable ID from a live post", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const payoutId = await seedPayout(t, fixture.assignmentId);
  const before = await t.run((ctx) => ctx.db.get("payouts", payoutId));
  const payout = await t.run((ctx) => requirePayout(ctx, { role: "operator" }, payoutId));
  expect(payout).not.toHaveProperty("deliverableId");
  expect(await t.run((ctx) => ctx.db.get("payouts", payoutId))).toEqual(before);
});

test("review eligibility preserves stored state across the deadline and cancelled assignments", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t, { status: "cancelled" }, "admin");
  const payoutId = await seedPayout(t, fixture.assignmentId);
  const before = (await t.run((ctx) => ctx.db.get("payouts", payoutId)))!;
  const viewer: PayoutViewer = {
    role: "company",
    companyId: before.companyId,
    companyRole: "admin",
  };
  vi.useFakeTimers({ toFake: ["Date"] });
  for (const now of [before.approvalDueAt - 1, before.approvalDueAt + 1]) {
    vi.setSystemTime(now);
    const payout = await t.run((ctx) => requirePayout(ctx, viewer, payoutId));
    expect(payout).toMatchObject({
      approvalStatus: "pending",
      approvalDueAt: before.approvalDueAt,
      review: { hasOpenDispute: false, canApprove: true },
    });
    expect(await t.run((ctx) => ctx.db.get("payouts", payoutId))).toEqual(before);
  }
  // A generic company ownership scope without a verified admin role grants no action.
  expect(
    (
      await t.run((ctx) =>
        requirePayout(
          ctx,
          {
            role: "company",
            companyId: before.companyId,
          },
          payoutId,
        ),
      )
    ).review.canApprove,
  ).toBe(false);
});

test("lists mixed approval states by review time rather than insertion time or status", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const newest = await seedPayout(t, fixture.assignmentId, {
    reviewRequestedAt: 3000,
    approvalStatus: "approved",
  });
  const oldest = await seedPayout(t, fixture.assignmentId, { reviewRequestedAt: 1000 });
  const middle = await seedPayout(t, fixture.assignmentId, { reviewRequestedAt: 2000 });

  const result = await t.run(
    async (ctx) =>
      await listPayouts(
        ctx,
        { role: "creator", creatorId: fixture.creatorId },
        {
          paginationOpts: firstPage,
        },
      ),
  );

  expect(result.page.map((payout) => payout._id)).toEqual([newest, middle, oldest]);
  expect(result.isDone).toBe(true);
});

test("preserves the post and optional payout context while omitting private fields", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const postId = await seedPost(t, fixture.assignmentId);
  const payoutId = await seedPayout(t, fixture.assignmentId, {
    postId,
    earningPeriod: { startsAt: 1000, endsAt: 2000 },
    approvalStatus: "approved",
    approvedAt: 3000,
    approvalSource: "company",
    approvedBy: fixture.membership.userId,
    paymentStatus: "transferred",
    transferredAt: 4000,
  });
  const stored = await t.run(async (ctx) => await ctx.db.get("payouts", payoutId));
  if (stored === null) throw new Error("expected seeded payout");
  const expected: Record<string, unknown> = { ...stored };
  delete expected.sourceKey;
  delete expected.approvedBy;
  expected.review = { hasOpenDispute: false, canApprove: false };

  expect(
    await t.run(async (ctx) => await requirePayout(ctx, { role: "operator" }, payoutId)),
  ).toEqual(expected);
});

test.each(["creator", "company"] as const)(
  "%s reads report foreign and missing payout IDs identically",
  async (role) => {
    const t = convexTest(schema, modules);
    const scenario = await seedReadScenario(t);
    const get = () =>
      t.run(async (ctx) => await requirePayout(ctx, scenario.viewers[role], scenario.foreign));
    await expectApiError(get, "not_found");
    await t.run(async (ctx) => await ctx.db.delete("payouts", scenario.foreign));
    await expectApiError(get, "not_found");
  },
);

test.each(["creator", "company", "operator"] as const)(
  "%s lists only owned payouts and can filter approval status without changing order",
  async (role) => {
    const t = convexTest(schema, modules);
    const scenario = await seedReadScenario(t);
    const expected = {
      creator: [scenario.own, scenario.creatorPeer],
      company: [scenario.own, scenario.companyPeer],
      operator: [scenario.foreign, scenario.own, scenario.companyPeer, scenario.creatorPeer],
    }[role];
    for (const approvalStatus of [undefined, "pending", "approved"] as const) {
      const result = await t.run(
        async (ctx) =>
          await listPayouts(ctx, scenario.viewers[role], {
            approvalStatus,
            paginationOpts: firstPage,
          }),
      );
      const approved = new Set([scenario.own, scenario.foreign]);
      expect(result.page.map((payout) => payout._id)).toEqual(
        expected.filter(
          (id) =>
            approvalStatus === undefined || approved.has(id) === (approvalStatus === "approved"),
        ),
      );
      expect(result.isDone).toBe(true);
      for (const payout of result.page) {
        expect(payout).not.toHaveProperty("sourceKey");
        expect(payout).not.toHaveProperty("approvedBy");
      }
    }
  },
);

test.each(["campaign", "assignment"] as const)(
  "company rejects a foreign %s before scanning payouts",
  async (parent) => {
    const t = convexTest(schema, modules);
    const scenario = await seedReadScenario(t);
    const filters =
      parent === "campaign"
        ? { campaignId: scenario.otherCompany.campaignId }
        : { assignmentId: scenario.foreignAssignmentId };

    await t.run(async (ctx) => {
      const query = vi.spyOn(ctx.db, "query");
      try {
        await expectApiError(
          () =>
            listPayouts(ctx, scenario.viewers.company, {
              ...filters,
              paginationOpts: firstPage,
            }),
          "not_found",
        );
        expect(query).not.toHaveBeenCalled();
      } finally {
        query.mockRestore();
      }
    });
  },
);

test.each(["creator", "company", "operator"] as const)(
  "%s parent filters narrow stored ownership and can be combined",
  async (role) => {
    const t = convexTest(schema, modules);
    const scenario = await seedReadScenario(t);
    const filters = [
      {
        args: { assignmentId: scenario.fixture.assignmentId },
        expected: [scenario.own],
      },
      {
        args: { campaignId: scenario.assignment.campaignId },
        expected: role === "creator" ? [scenario.own] : [scenario.own, scenario.companyPeer],
      },
      {
        args: {
          assignmentId: scenario.fixture.assignmentId,
          campaignId: scenario.assignment.campaignId,
        },
        expected: [scenario.own],
      },
      {
        args: {
          assignmentId: scenario.fixture.assignmentId,
          campaignId: scenario.otherCompany.campaignId,
        },
        expected: [],
        companyNotFound: true,
      },
      {
        args: {
          assignmentId: scenario.foreignAssignmentId,
          campaignId: scenario.assignment.campaignId,
        },
        expected: [],
        companyNotFound: true,
      },
      {
        args: { assignmentId: scenario.foreignAssignmentId },
        expected: role === "operator" ? [scenario.foreign] : [],
        companyNotFound: true,
      },
      {
        args: { campaignId: scenario.otherCompany.campaignId },
        expected:
          role === "operator"
            ? [scenario.foreign, scenario.creatorPeer]
            : role === "creator"
              ? [scenario.creatorPeer]
              : [],
        companyNotFound: true,
      },
    ];
    for (const { args, expected, companyNotFound } of filters) {
      for (const approvalStatus of [undefined, "pending", "approved"] as const) {
        const read = () =>
          t.run(
            async (ctx) =>
              await listPayouts(ctx, scenario.viewers[role], {
                ...args,
                approvalStatus,
                paginationOpts: firstPage,
              }),
          );
        if (role === "company" && companyNotFound) {
          await expectApiError(read, "not_found");
          continue;
        }
        const result = await read();
        const approved = new Set([scenario.own, scenario.foreign]);
        expect(result.page.map((payout) => payout._id)).toEqual(
          expected.filter(
            (id) =>
              approvalStatus === undefined || approved.has(id) === (approvalStatus === "approved"),
          ),
        );
      }
    }
  },
);

test.each(["creator", "company", "operator"] as const)(
  "%s parent-scoped history survives missing assignments and campaigns",
  async (role) => {
    const t = convexTest(schema, modules);
    const scenario = await seedReadScenario(t);
    await t.run(async (ctx) => {
      await ctx.db.delete("assignments", scenario.fixture.assignmentId);
      await ctx.db.delete("campaigns", scenario.assignment.campaignId);
    });
    for (const { filters, expected } of [
      { filters: { assignmentId: scenario.fixture.assignmentId }, expected: [scenario.own] },
      {
        filters: { campaignId: scenario.assignment.campaignId },
        expected: role === "creator" ? [scenario.own] : [scenario.own, scenario.companyPeer],
      },
      {
        filters: {
          assignmentId: scenario.fixture.assignmentId,
          campaignId: scenario.assignment.campaignId,
        },
        expected: [scenario.own],
      },
    ]) {
      const result = await t.run(
        async (ctx) =>
          await listPayouts(ctx, scenario.viewers[role], {
            ...filters,
            paginationOpts: firstPage,
          }),
      );
      expect(result.page.map((payout) => payout._id)).toEqual(expected);
    }
  },
);

test("missing foreign parents do not expose another company's payout history", async () => {
  const t = convexTest(schema, modules);
  const scenario = await seedReadScenario(t);
  await t.run(async (ctx) => {
    await ctx.db.delete("assignments", scenario.foreignAssignmentId);
    await ctx.db.delete("campaigns", scenario.otherCompany.campaignId);
  });
  for (const filters of [
    { assignmentId: scenario.foreignAssignmentId },
    { campaignId: scenario.otherCompany.campaignId },
    {
      assignmentId: scenario.foreignAssignmentId,
      campaignId: scenario.otherCompany.campaignId,
    },
  ]) {
    const result = await t.run(
      async (ctx) =>
        await listPayouts(ctx, scenario.viewers.company, {
          ...filters,
          paginationOpts: firstPage,
        }),
    );
    expect(result.page).toEqual([]);
  }
});

test("cursor pages preserve chronological order across mixed approval states", async () => {
  const t = convexTest(schema, modules);
  const scenario = await seedReadScenario(t);
  const readPage = (cursor: string | null) =>
    t.run(
      async (ctx) =>
        await listPayouts(ctx, scenario.viewers.operator, {
          paginationOpts: { numItems: 2, cursor },
        }),
    );
  const first = await readPage(null);
  expect(first.isDone).toBe(false);
  const second = await readPage(first.continueCursor);
  expect([...first.page, ...second.page].map((payout) => payout._id)).toEqual([
    scenario.foreign,
    scenario.own,
    scenario.companyPeer,
    scenario.creatorPeer,
  ]);
  expect(second.isDone).toBe(true);
});

test("cursor pages do not skip tied review times with different approval states", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const postId = await seedPost(t, fixture.assignmentId);
  const firstCreated = await seedPayout(t, fixture.assignmentId, {
    postId,
    sourceKey: "period-1",
    reviewRequestedAt: 3000,
    approvalStatus: "pending",
  });
  const secondCreated = await seedPayout(t, fixture.assignmentId, {
    postId,
    sourceKey: "period-2",
    reviewRequestedAt: 3000,
    approvalStatus: "approved",
  });
  const lastCreated = await seedPayout(t, fixture.assignmentId, {
    postId,
    sourceKey: "period-3",
    reviewRequestedAt: 3000,
    approvalStatus: "pending",
  });
  const readPage = (cursor: string | null) =>
    t.run(
      async (ctx) =>
        await listPayouts(
          ctx,
          { role: "company", companyId: fixture.membership.companyId },
          {
            paginationOpts: { numItems: 1, cursor },
          },
        ),
    );
  const first = await readPage(null);
  const second = await readPage(first.continueCursor);
  const third = await readPage(second.continueCursor);

  expect([...first.page, ...second.page, ...third.page].map((payout) => payout._id)).toEqual([
    lastCreated,
    secondCreated,
    firstCreated,
  ]);
  expect([...first.page, ...second.page, ...third.page].map((payout) => payout.postId)).toEqual([
    postId,
    postId,
    postId,
  ]);
  expect(first.isDone).toBe(false);
  expect(second.isDone).toBe(false);
  expect(third.isDone).toBe(true);
});
