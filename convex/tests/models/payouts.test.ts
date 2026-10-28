/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import type { ResourceViewer } from "../../lib/authz";
import { listPayouts, requirePayout } from "../../models/payouts";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignment,
  seedAssignmentFixture,
  seedCreatorId,
  seedOpportunity,
  seedPayout,
  seedSubmission,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
const firstPage = { numItems: 10, cursor: null };

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

test("the creator can read payout history after its assignment is removed", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const payoutId = await seedPayout(t, fixture.assignmentId);
  await t.run(async (ctx) => await ctx.db.delete("assignments", fixture.assignmentId));

  const payout = await t.run(
    async (ctx) =>
      await requirePayout(ctx, { role: "creator", creatorId: fixture.creatorId }, payoutId),
  );

  expect(payout).toMatchObject({
    _id: payoutId,
    assignmentId: fixture.assignmentId,
    creatorId: fixture.creatorId,
    companyId: fixture.membership.companyId,
    amountCents: 10_000,
    currency: "usd",
    approvalStatus: "pending",
    paymentStatus: "notStarted",
  });
  expect(payout).not.toHaveProperty("sourceKey");
  expect(payout).not.toHaveProperty("approvedBy");
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

test("preserves optional payout context while omitting private fields", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t);
  const submissionId = await seedSubmission(t, fixture, "approved");
  const postId = await t.run(async (ctx) => {
    const assignment = await ctx.db.get("assignments", fixture.assignmentId);
    if (assignment === null) throw new Error("expected seeded assignment");
    return await ctx.db.insert("posts", {
      submissionId,
      campaignId: assignment.campaignId,
      url: "https://x.com/creator/status/1234",
      xPostId: "1234",
      isActive: true,
      isVerified: true,
      postedAt: 1000,
    });
  });
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
      },
      {
        args: { assignmentId: scenario.foreignAssignmentId },
        expected: role === "operator" ? [scenario.foreign] : [],
      },
      {
        args: { campaignId: scenario.otherCompany.campaignId },
        expected:
          role === "operator"
            ? [scenario.foreign, scenario.creatorPeer]
            : role === "creator"
              ? [scenario.creatorPeer]
              : [],
      },
    ];
    for (const { args, expected } of filters) {
      for (const approvalStatus of [undefined, "pending", "approved"] as const) {
        const result = await t.run(
          async (ctx) =>
            await listPayouts(ctx, scenario.viewers[role], {
              ...args,
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
      }
    }
  },
);

test("parent-scoped history survives missing assignments and campaigns", async () => {
  const t = convexTest(schema, modules);
  const scenario = await seedReadScenario(t);
  await t.run(async (ctx) => {
    await ctx.db.delete("assignments", scenario.fixture.assignmentId);
    await ctx.db.delete("campaigns", scenario.assignment.campaignId);
  });
  const result = await t.run(
    async (ctx) =>
      await listPayouts(ctx, scenario.viewers.creator, {
        assignmentId: scenario.fixture.assignmentId,
        campaignId: scenario.assignment.campaignId,
        paginationOpts: firstPage,
      }),
  );
  expect(result.page.map((payout) => payout._id)).toEqual([scenario.own]);
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
  const firstCreated = await seedPayout(t, fixture.assignmentId, {
    sourceKey: "period-1",
    reviewRequestedAt: 3000,
    approvalStatus: "pending",
  });
  const secondCreated = await seedPayout(t, fixture.assignmentId, {
    sourceKey: "period-2",
    reviewRequestedAt: 3000,
    approvalStatus: "approved",
  });
  const lastCreated = await seedPayout(t, fixture.assignmentId, {
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
  expect(first.isDone).toBe(false);
  expect(second.isDone).toBe(false);
  expect(third.isDone).toBe(true);
});
