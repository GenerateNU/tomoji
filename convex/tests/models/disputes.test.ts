/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { AssignmentViewer } from "../../models/assignments";
import {
  createDispute,
  listDisputes,
  requireDispute,
  resolveDispute,
  respondToDispute,
  type DisputeDraft,
  type DisputeListFilters,
  type DisputeResolution,
} from "../../models/disputes";
import schema from "../../schema";
import { companyDisputeReasons, creatorDisputeReasons } from "../../schemas/disputes.schema";
import {
  expectApiError,
  seedAssignment,
  seedAssignmentFixture,
  seedCreatorId,
  seedDispute,
  seedMembership,
  seedOneSubmission,
  seedOperatorId,
  seedOpportunity,
  storedDisputes,
  type AssignmentFixture,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

const firstPage = { numItems: 10, cursor: null };

function creatorOf(fixture: AssignmentFixture): AssignmentViewer {
  return { role: "creator", creatorId: fixture.creatorId };
}

function companyOf(fixture: AssignmentFixture): AssignmentViewer {
  return { role: "company", companyId: fixture.membership.companyId };
}

const operator: AssignmentViewer = { role: "operator" };

/** Opens a dispute on the fixture's assignment, as its creator unless `viewer` says otherwise. */
async function open(
  t: TestConvex,
  fixture: AssignmentFixture,
  overrides: Partial<DisputeDraft> = {},
  viewer: AssignmentViewer = creatorOf(fixture),
) {
  const draft: DisputeDraft = {
    assignmentId: fixture.assignmentId,
    reason: "paymentNotReceived",
    description: "  The video went live on Oct 1 and the fixed fee hasn't arrived.  ",
    ...overrides,
  };
  return await t.run(async (ctx) => await createDispute(ctx, viewer, fixture.creatorUserId, draft));
}

async function resolve(
  t: TestConvex,
  resolvedBy: Id<"users">,
  disputeId: Id<"disputes">,
  overrides: Partial<DisputeResolution> = {},
) {
  const resolution: DisputeResolution = {
    outcome: "termsKept",
    decision: "  Original terms kept. Only views in the 30-day window count toward CPM.  ",
    ...overrides,
  };
  return await t.run(async (ctx) => await resolveDispute(ctx, resolvedBy, disputeId, resolution));
}

async function list(t: TestConvex, viewer: AssignmentViewer, filters: Partial<DisputeListFilters>) {
  const { page } = await t.run(
    async (ctx) =>
      await listDisputes(ctx, viewer, { status: "open", paginationOpts: firstPage, ...filters }),
  );
  return page.map((dispute) => dispute._id);
}

/** A ruling from an earlier day, for seeding disputes that are already resolved. */
const pastRuling = {
  resolvedAt: Date.parse("2026-10-07T12:00:00Z"),
  outcome: "termsKept",
  decision: "Original terms kept.",
} as const;

describe("createDispute", () => {
  test("stores an open dispute with the assignment's owners and trimmed text", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const assignment = await t.run(
      async (ctx) => await ctx.db.get("assignments", fixture.assignmentId),
    );

    const disputeId = await open(t, fixture);

    expect(await storedDisputes(t)).toEqual([
      {
        _id: disputeId,
        _creationTime: expect.any(Number),
        assignmentId: fixture.assignmentId,
        companyId: assignment!.companyId,
        creatorId: fixture.creatorId,
        campaignId: assignment!.campaignId,
        openedBy: fixture.creatorUserId,
        openedByRole: "creator",
        reason: "paymentNotReceived",
        description: "The video went live on Oct 1 and the fixed fee hasn't arrived.",
        evidenceSubmissionIds: [],
        evidencePostIds: [],
        status: "open",
      },
    ]);
  });

  test("records the approved submission and its posts as evidence", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, "approved");
    const postId = await t.run(
      async (ctx) =>
        await ctx.db.insert("posts", {
          submissionId,
          url: "https://www.tiktok.com/@julia/video/1",
          postedAt: Date.now(),
          isVerified: true,
        }),
    );

    await open(t, fixture);

    const [stored] = await storedDisputes(t);
    expect(stored).toMatchObject({
      evidenceSubmissionIds: [submissionId],
      evidencePostIds: [postId],
    });
  });

  test.each(["pending", "changesRequested"] as const)(
    "records no evidence when the newest submission is %s",
    async (status) => {
      const t = convexTest(schema, modules);
      const { fixture } = await seedOneSubmission(t, status);

      await open(t, fixture);

      const [stored] = await storedDisputes(t);
      expect(stored).toMatchObject({ evidenceSubmissionIds: [], evidencePostIds: [] });
    },
  );

  test.each(["termsPending", "active", "completed", "cancelled"] as const)(
    "allows a %s assignment",
    async (status) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignmentFixture(t, { status });

      await open(t, fixture);

      expect(await storedDisputes(t)).toHaveLength(1);
    },
  );

  test("allows several disputes on one assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    await open(t, fixture);
    await open(t, fixture);

    expect(await storedDisputes(t)).toHaveLength(2);
  });

  test.each(creatorDisputeReasons)(
    "accepts the creator reason %s from a creator",
    async (reason) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignmentFixture(t);

      await open(t, fixture, { reason });

      expect(await storedDisputes(t)).toHaveLength(1);
    },
  );

  test.each(companyDisputeReasons)(
    "accepts the company reason %s from a company",
    async (reason) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignmentFixture(t);

      await open(t, fixture, { reason }, companyOf(fixture));

      expect(await storedDisputes(t)).toHaveLength(1);
    },
  );

  test("lets an operator give either side's reason", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    await open(t, fixture, { reason: "missingDisclosure" }, operator);
    await open(t, fixture, { reason: "payoutAmount" }, operator);

    expect(await storedDisputes(t)).toHaveLength(2);
  });

  test.each([
    ["a creator giving a company reason", "missingDisclosure", "creator"],
    ["a company giving a creator reason", "payoutAmount", "company"],
  ] as const)("refuses %s without writing", async (_case, reason, side) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const viewer = side === "creator" ? creatorOf(fixture) : companyOf(fixture);

    await expect(open(t, fixture, { reason }, viewer)).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "dispute_reason_not_allowed" },
    });
    expect(await storedDisputes(t)).toEqual([]);
  });

  test.each([
    ["a blank description", "   ", "description_blank"],
    ["a description over 5000 characters", "x".repeat(5001), "description_too_long"],
  ])("refuses %s without writing", async (_case, description, reason) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    await expect(open(t, fixture, { description })).rejects.toMatchObject({
      data: { code: "invalid_state", reason },
    });
    expect(await storedDisputes(t)).toEqual([]);
  });

  test("conceals another creator's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const otherCreatorId = await seedCreatorId(t, "other-creator");

    await expectApiError(
      () => open(t, fixture, {}, { role: "creator", creatorId: otherCreatorId }),
      "not_found",
    );
  });
});

describe("resolveDispute", () => {
  test("closes an open dispute with the operator, time, outcome, and trimmed decision", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const operatorId = await seedOperatorId(t, "operator");

    const result = await resolve(t, operatorId, disputeId);

    const [stored] = await storedDisputes(t);
    expect(result).toEqual(stored);
    expect(stored).toMatchObject({
      status: "resolved",
      resolvedBy: operatorId,
      resolvedAt: Date.now(),
      outcome: "termsKept",
      decision: "Original terms kept. Only views in the 30-day window count toward CPM.",
    });
  });

  test("refuses a resolved dispute without changing it", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const operatorId = await seedOperatorId(t, "operator");
    const disputeId = await seedDispute(t, fixture, {}, { ...pastRuling, resolvedBy: operatorId });
    const before = await storedDisputes(t);

    await expect(resolve(t, operatorId, disputeId, { outcome: "adjusted" })).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "already_resolved" },
    });
    expect(await storedDisputes(t)).toEqual(before);
  });

  test.each([
    ["a blank decision", "  ", "decision_blank"],
    ["a decision over 2000 characters", "x".repeat(2001), "decision_too_long"],
  ])("refuses %s without changing it", async (_case, decision, reason) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const operatorId = await seedOperatorId(t, "operator");

    await expect(resolve(t, operatorId, disputeId, { decision })).rejects.toMatchObject({
      data: { code: "invalid_state", reason },
    });
    expect((await storedDisputes(t))[0].status).toBe("open");
  });

  test("reports a missing dispute as not found", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const operatorId = await seedOperatorId(t, "operator");
    await t.run(async (ctx) => await ctx.db.delete("disputes", disputeId));

    await expectApiError(() => resolve(t, operatorId, disputeId), "not_found");
  });
});

describe("respondToDispute", () => {
  /** Responds as the fixture's creator or company user. */
  async function respond(
    t: TestConvex,
    fixture: AssignmentFixture,
    side: "creator" | "company",
    disputeId: Id<"disputes">,
    body = "  We added #ad to the caption on Oct 3; screenshot attached.  ",
  ) {
    const [viewer, respondedBy] =
      side === "creator"
        ? [creatorOf(fixture), fixture.creatorUserId]
        : [companyOf(fixture), fixture.membership.userId];
    return await t.run(
      async (ctx) => await respondToDispute(ctx, viewer, respondedBy, disputeId, body),
    );
  }

  test("stores each side's trimmed response in its own slot", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);

    await respond(t, fixture, "company", disputeId);
    await respond(t, fixture, "creator", disputeId, "The brief allows it.");

    const [stored] = await storedDisputes(t);
    expect(stored).toMatchObject({
      companyResponse: {
        body: "We added #ad to the caption on Oct 3; screenshot attached.",
        respondedBy: fixture.membership.userId,
        respondedAt: Date.now(),
      },
      creatorResponse: { body: "The brief allows it.", respondedBy: fixture.creatorUserId },
    });
  });

  test("replaces the side's response while the dispute is open", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    await respond(t, fixture, "company", disputeId, "First draft.");
    vi.advanceTimersByTime(1000);

    await respond(t, fixture, "company", disputeId, "Corrected.");

    const [stored] = await storedDisputes(t);
    expect(stored.companyResponse).toEqual({
      body: "Corrected.",
      respondedBy: fixture.membership.userId,
      respondedAt: Date.now(),
    });
    expect(stored.creatorResponse).toBeUndefined();
  });

  test("lets the opener's own side respond too", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);

    await respond(t, fixture, "creator", disputeId);

    expect((await storedDisputes(t))[0].creatorResponse).toBeDefined();
  });

  test("returns the creator view without who responded", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    await respond(t, fixture, "company", disputeId);

    const view = await respond(t, fixture, "creator", disputeId, "Thanks.");

    expect(view.companyResponse).toEqual({
      body: "We added #ad to the caption on Oct 3; screenshot attached.",
      respondedAt: Date.now(),
    });
    expect(view.creatorResponse).toEqual({ body: "Thanks.", respondedAt: Date.now() });
  });

  test("refuses a resolved dispute without changing it", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const operatorId = await seedOperatorId(t, "operator");
    const disputeId = await seedDispute(t, fixture, {}, { ...pastRuling, resolvedBy: operatorId });
    const before = await storedDisputes(t);

    await expect(respond(t, fixture, "company", disputeId)).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "already_resolved" },
    });
    expect(await storedDisputes(t)).toEqual(before);
  });

  test.each([
    ["a blank response", "   ", "response_blank"],
    ["a response over 5000 characters", "x".repeat(5001), "response_too_long"],
  ])("refuses %s", async (_case, body, reason) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);

    await expect(respond(t, fixture, "company", disputeId, body)).rejects.toMatchObject({
      data: { code: "invalid_state", reason },
    });
  });

  test("refuses operators, who resolve instead", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const operatorId = await seedOperatorId(t, "operator");

    await expectApiError(
      () =>
        t.run(
          async (ctx) => await respondToDispute(ctx, operator, operatorId, disputeId, "Noted."),
        ),
      "forbidden",
    );
  });

  test("conceals another company's dispute", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const { membership } = await seedMembership(t, "outsider");

    await expectApiError(
      () =>
        t.run(
          async (ctx) =>
            await respondToDispute(
              ctx,
              { role: "company", companyId: membership.companyId },
              membership.userId,
              disputeId,
              "Not ours.",
            ),
        ),
      "not_found",
    );
  });
});

describe("requireDispute", () => {
  test("gives company users and operators the stored row", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const [stored] = await storedDisputes(t);

    for (const viewer of [companyOf(fixture), operator]) {
      const view = await t.run(async (ctx) => await requireDispute(ctx, viewer, disputeId));
      expect(view).toEqual(stored);
    }
  });

  test("gives creators the side, outcome, and decision, but no user IDs", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(
      t,
      fixture,
      {
        openedBy: fixture.membership.userId,
        openedByRole: "company",
        reason: "missingDisclosure",
      },
      { ...pastRuling, resolvedBy: fixture.membership.userId },
    );

    const view = await t.run(
      async (ctx) => await requireDispute(ctx, creatorOf(fixture), disputeId),
    );

    expect(view).not.toHaveProperty("openedBy");
    expect(view).not.toHaveProperty("resolvedBy");
    expect(view).toMatchObject({ openedByRole: "company", status: "resolved", ...pastRuling });
  });

  test("reports another company's dispute and a missing one the same way", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const { membership } = await seedMembership(t, "outsider");
    const outsider: AssignmentViewer = { role: "company", companyId: membership.companyId };
    const missingId = await seedDispute(t, fixture);
    await t.run(async (ctx) => await ctx.db.delete("disputes", missingId));

    for (const [viewer, id] of [
      [outsider, disputeId],
      [companyOf(fixture), missingId],
    ] as const) {
      await expect(
        t.run(async (ctx) => await requireDispute(ctx, viewer, id)),
      ).rejects.toMatchObject({ data: { code: "not_found", resource: "dispute" } });
    }
  });
});

describe("listDisputes", () => {
  test("lists the company's open disputes newest first", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const older = await seedDispute(t, fixture);
    vi.advanceTimersByTime(1000);
    const newer = await seedDispute(t, fixture);
    const operatorId = await seedOperatorId(t, "operator");
    await seedDispute(t, fixture, {}, { ...pastRuling, resolvedBy: operatorId });

    expect(await list(t, companyOf(fixture), {})).toEqual([newer, older]);
  });

  test("lists resolved disputes most recently closed first", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const operatorId = await seedOperatorId(t, "operator");
    const closedFirst = await seedDispute(t, fixture);
    const closedLast = await seedDispute(t, fixture);
    await resolve(t, operatorId, closedLast);
    vi.advanceTimersByTime(1000);
    await resolve(t, operatorId, closedFirst);

    expect(await list(t, companyOf(fixture), { status: "resolved" })).toEqual([
      closedFirst,
      closedLast,
    ]);
  });

  test("keeps only one side's disputes when asked", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const byCreator = await seedDispute(t, fixture);
    const byCompany = await seedDispute(t, fixture, {
      openedBy: fixture.membership.userId,
      openedByRole: "company",
      reason: "missingDisclosure",
    });

    expect(await list(t, companyOf(fixture), { openedByRole: "creator" })).toEqual([byCreator]);
    expect(await list(t, creatorOf(fixture), { openedByRole: "company" })).toEqual([byCompany]);
    expect(await list(t, operator, { openedByRole: "company" })).toEqual([byCompany]);
  });

  test("lists the creator's disputes and nobody else's", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const otherCreatorId = await seedCreatorId(t, "other-creator");

    expect(await list(t, creatorOf(fixture), {})).toEqual([disputeId]);
    expect(await list(t, { role: "creator", creatorId: otherCreatorId }, {})).toEqual([]);
  });

  test("gives operators every company's open disputes, oldest first", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const first = await seedDispute(t, fixture);
    vi.advanceTimersByTime(1000);
    const other = await seedOpportunity(t, { subject: "other-owner", orgId: "org_other" });
    const otherAssignmentId = await seedAssignment(t, {
      opportunityId: other.opportunityId,
      creatorId: await seedCreatorId(t, "other-creator"),
      status: "active",
    });
    const second = await seedDispute(t, { ...fixture, assignmentId: otherAssignmentId });

    expect(await list(t, operator, {})).toEqual([first, second]);
    expect(await list(t, companyOf(fixture), {})).toEqual([first]);
  });

  test("gives each row the same view as requireDispute", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);

    const { page, single } = await t.run(async (ctx) => ({
      page: (
        await listDisputes(ctx, creatorOf(fixture), { status: "open", paginationOpts: firstPage })
      ).page,
      single: await requireDispute(ctx, creatorOf(fixture), disputeId),
    }));

    expect(page).toEqual([single]);
  });
});
