/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { AssignmentViewer } from "../../models/assignments";
import {
  createDispute,
  listDisputes,
  requireDispute,
  overrideDispute,
  resolveDispute,
  type DisputeCreate,
  type DisputeListFilters,
  type DisputeOverride,
  type DisputeResolution,
} from "../../models/disputes";
import { createSubmission } from "../../models/submissions";
import schema from "../../schema";
import { companyDisputeReasons, creatorDisputeReasons } from "../../schemas/disputes.schema";
import {
  creatorNotifications,
  expectApiError,
  seedAssignment,
  seedAssignmentFixture,
  seedCreatorId,
  seedDispute,
  seedMembership,
  seedOneSubmission,
  seedOperatorId,
  seedOpportunity,
  seedSubmission,
  storedDisputes,
  storedSubmission,
  storedSubmissions,
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
  overrides: Partial<DisputeCreate> = {},
  viewer: AssignmentViewer = creatorOf(fixture),
) {
  const input: DisputeCreate = {
    assignmentId: fixture.assignmentId,
    reason: "paymentNotReceived",
    description: "  The video went live on Oct 1 and the fixed fee hasn't arrived.  ",
    ...overrides,
  };
  return await t.run(async (ctx) => await createDispute(ctx, viewer, fixture.creatorUserId, input));
}

/** Resolves a dispute as `viewer`, approved with a note unless `overrides` says otherwise. */
async function resolve(
  t: TestConvex,
  viewer: AssignmentViewer,
  resolvedBy: Id<"users">,
  disputeId: Id<"disputes">,
  overrides: Partial<DisputeResolution> = {},
) {
  const resolution: DisputeResolution = {
    outcome: "approved",
    note: "  Paid over email on Oct 9.  ",
    ...overrides,
  };
  return await t.run(
    async (ctx) => await resolveDispute(ctx, viewer, resolvedBy, disputeId, resolution),
  );
}

async function override(
  t: TestConvex,
  resolvedBy: Id<"users">,
  disputeId: Id<"disputes">,
  overrides: Partial<DisputeOverride> = {},
) {
  const ruling: DisputeOverride = {
    outcome: "denied",
    note: "  The brief required the disclosure in the first 5 seconds.  ",
    ...overrides,
  };
  return await t.run(async (ctx) => await overrideDispute(ctx, resolvedBy, disputeId, ruling));
}

async function list(t: TestConvex, viewer: AssignmentViewer, filters: Partial<DisputeListFilters>) {
  const { page } = await t.run(
    async (ctx) =>
      await listDisputes(ctx, viewer, { status: "open", paginationOpts: firstPage, ...filters }),
  );
  return page.map((dispute) => dispute._id);
}

async function insertPost(t: TestConvex, submissionId: Id<"submissions">) {
  return await t.run(async (ctx) => {
    const submission = await ctx.db.get("submissions", submissionId);
    const assignment = submission && (await ctx.db.get("assignments", submission.assignmentId));
    if (assignment === null) throw new Error("expected seeded assignment");
    return await ctx.db.insert("posts", {
      submissionId,
      campaignId: assignment.campaignId,
      url: "https://x.com/julia/status/1",
      xPostId: "1",
      isActive: true,
      postedAt: Date.now(),
      isVerified: true,
    });
  });
}

/** The creator's result from an earlier day, for seeding disputes that are already resolved. */
const pastRuling = {
  resolvedByRole: "creator",
  resolvedAt: Date.parse("2026-10-07T12:00:00Z"),
  outcome: "approved",
  note: "Sorted over email.",
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
        status: "open",
      },
    ]);
  });

  test("links the post it's about, which both sides then see", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, "approved");
    const postId = await insertPost(t, submissionId);

    const disputeId = await open(
      t,
      fixture,
      { reason: "missingDisclosure", postId },
      companyOf(fixture),
    );

    expect((await storedDisputes(t))[0].postId).toBe(postId);
    const creatorView = await t.run(
      async (ctx) => await requireDispute(ctx, creatorOf(fixture), disputeId),
    );
    expect(creatorView.postId).toBe(postId);
  });

  test("conceals a post from another assignment without writing", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const opportunityId = await t.run(
      async (ctx) => (await ctx.db.get("assignments", fixture.assignmentId))!.opportunityId,
    );
    const otherAssignmentId = await seedAssignment(t, {
      opportunityId,
      creatorId: await seedCreatorId(t, "other-creator"),
      status: "active",
    });
    const otherSubmissionId = await seedSubmission(
      t,
      { ...fixture, assignmentId: otherAssignmentId },
      "approved",
    );
    const postId = await insertPost(t, otherSubmissionId);

    await expect(open(t, fixture, { postId })).rejects.toMatchObject({
      data: { code: "not_found", resource: "post" },
    });
    expect(await storedDisputes(t)).toEqual([]);
  });

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

  test.each(creatorDisputeReasons.filter((reason) => reason !== "other"))(
    "accepts the creator reason %s from a creator",
    async (reason) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignmentFixture(t);

      await open(t, fixture, { reason });

      expect(await storedDisputes(t)).toHaveLength(1);
    },
  );

  test.each(companyDisputeReasons.filter((reason) => reason !== "other"))(
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

  test.each(["creator", "company"] as const)(
    "stores a trimmed custom reason when a %s picks other",
    async (side) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignmentFixture(t);
      const viewer = side === "creator" ? creatorOf(fixture) : companyOf(fixture);

      await open(
        t,
        fixture,
        { reason: "other", customReason: "  Posted outside the agreed window  " },
        viewer,
      );

      const [stored] = await storedDisputes(t);
      expect(stored).toMatchObject({
        reason: "other",
        customReason: "Posted outside the agreed window",
      });
    },
  );

  test.each([
    ["no custom reason", undefined, "customReason_blank"],
    ["a blank custom reason", "   ", "customReason_blank"],
    ["a custom reason over 200 characters", "x".repeat(201), "customReason_too_long"],
  ])("refuses other with %s without writing", async (_case, customReason, reason) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    await expect(open(t, fixture, { reason: "other", customReason })).rejects.toMatchObject({
      data: { code: "invalid_state", reason },
    });
    expect(await storedDisputes(t)).toEqual([]);
  });

  test("refuses a custom reason with any reason but other", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    await expect(
      open(t, fixture, { reason: "paymentNotReceived", customReason: "Late" }),
    ).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "custom_reason_not_allowed" },
    });
    expect(await storedDisputes(t)).toEqual([]);
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
  test("lets the opener's side close it with an outcome and a trimmed note", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);

    await resolve(t, creatorOf(fixture), fixture.creatorUserId, disputeId);

    const [stored] = await storedDisputes(t);
    expect(stored).toMatchObject({
      status: "resolved",
      resolvedBy: fixture.creatorUserId,
      resolvedByRole: "creator",
      resolvedAt: Date.now(),
      outcome: "approved",
      note: "Paid over email on Oct 9.",
    });
  });

  test("lets any member of a company close the company's dispute", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture, {
      openedBy: fixture.membership.userId,
      openedByRole: "company",
      reason: "missingDisclosure",
    });
    const teammate = await seedMembership(t, "teammate", "org_fixture");

    await resolve(t, companyOf(fixture), teammate.membership.userId, disputeId, {
      outcome: "denied",
    });

    expect((await storedDisputes(t))[0]).toMatchObject({
      resolvedBy: teammate.membership.userId,
      resolvedByRole: "company",
      outcome: "denied",
    });
  });

  test("leaves a blank note out", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);

    await resolve(t, creatorOf(fixture), fixture.creatorUserId, disputeId, { note: "   " });

    expect((await storedDisputes(t))[0]).not.toHaveProperty("note");
  });

  test("lets the opener withdraw", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);

    await resolve(t, creatorOf(fixture), fixture.creatorUserId, disputeId, {
      outcome: "withdrawn",
    });

    expect((await storedDisputes(t))[0]).toMatchObject({ outcome: "withdrawn" });
  });

  test("lets an operator resolve an open dispute directly", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const operatorId = await seedOperatorId(t, "operator");

    await resolve(t, operator, operatorId, disputeId, { outcome: "denied" });

    expect((await storedDisputes(t))[0]).toMatchObject({
      resolvedBy: operatorId,
      resolvedByRole: "operator",
      outcome: "denied",
    });
  });

  test("refuses the other side without changing it", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);

    await expect(
      resolve(t, companyOf(fixture), fixture.membership.userId, disputeId),
    ).rejects.toMatchObject({ data: { code: "forbidden", reason: "not_opener" } });
    expect((await storedDisputes(t))[0].status).toBe("open");
  });

  test("refuses an operator withdrawing a dispute they didn't open", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const operatorId = await seedOperatorId(t, "operator");

    await expect(
      resolve(t, operator, operatorId, disputeId, { outcome: "withdrawn" }),
    ).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "withdraw_by_opener_only" },
    });
  });

  test("refuses a resolved dispute without changing it", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(
      t,
      fixture,
      {},
      { ...pastRuling, resolvedBy: fixture.creatorUserId },
    );
    const before = await storedDisputes(t);

    await expect(
      resolve(t, creatorOf(fixture), fixture.creatorUserId, disputeId, { outcome: "denied" }),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "already_resolved" } });
    expect(await storedDisputes(t)).toEqual(before);
  });

  test("refuses a note over 2000 characters", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);

    await expect(
      resolve(t, creatorOf(fixture), fixture.creatorUserId, disputeId, {
        note: "x".repeat(2001),
      }),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "note_too_long" } });
  });

  test("conceals another company's dispute", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const { membership } = await seedMembership(t, "outsider");

    await expectApiError(
      () =>
        resolve(
          t,
          { role: "company", companyId: membership.companyId },
          membership.userId,
          disputeId,
        ),
      "not_found",
    );
  });
});

describe("overrideDispute", () => {
  test("replaces the opener's result and keeps it on record", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(
      t,
      fixture,
      {},
      { ...pastRuling, resolvedBy: fixture.creatorUserId },
    );
    const operatorId = await seedOperatorId(t, "operator");

    const result = await override(t, operatorId, disputeId);

    const [stored] = await storedDisputes(t);
    expect(result).toEqual(stored);
    expect(stored).toMatchObject({
      status: "resolved",
      resolvedBy: operatorId,
      resolvedByRole: "operator",
      resolvedAt: Date.now(),
      outcome: "denied",
      note: "The brief required the disclosure in the first 5 seconds.",
      overriddenResolution: { ...pastRuling, resolvedBy: fixture.creatorUserId },
    });
  });

  test("refuses an open dispute", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const operatorId = await seedOperatorId(t, "operator");

    await expect(override(t, operatorId, disputeId)).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "dispute_not_resolved" },
    });
  });

  test("refuses to override Tomoji's own ruling without changing it", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const operatorId = await seedOperatorId(t, "operator");
    const disputeId = await seedDispute(
      t,
      fixture,
      {},
      { ...pastRuling, resolvedBy: operatorId, resolvedByRole: "operator" },
    );
    const before = await storedDisputes(t);

    await expect(override(t, operatorId, disputeId)).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "operator_ruling_final" },
    });
    expect(await storedDisputes(t)).toEqual(before);
  });

  test("refuses to override a withdrawal without changing it", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(
      t,
      fixture,
      {},
      { ...pastRuling, resolvedBy: fixture.creatorUserId, outcome: "withdrawn" },
    );
    const operatorId = await seedOperatorId(t, "operator");
    const before = await storedDisputes(t);

    await expect(override(t, operatorId, disputeId)).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "dispute_withdrawn" },
    });
    expect(await storedDisputes(t)).toEqual(before);
  });

  test("requires a reason", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(
      t,
      fixture,
      {},
      { ...pastRuling, resolvedBy: fixture.creatorUserId },
    );
    const operatorId = await seedOperatorId(t, "operator");

    await expect(override(t, operatorId, disputeId, { note: "  " })).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "note_blank" },
    });
  });

  test("reports a missing dispute as not found", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const operatorId = await seedOperatorId(t, "operator");
    await t.run(async (ctx) => await ctx.db.delete("disputes", disputeId));

    await expectApiError(() => override(t, operatorId, disputeId), "not_found");
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

  test("gives creators who closed it and how, but no user IDs", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const companyResult = {
      ...pastRuling,
      resolvedBy: fixture.membership.userId,
      resolvedByRole: "company",
    } as const;
    const disputeId = await seedDispute(
      t,
      fixture,
      {
        openedBy: fixture.membership.userId,
        openedByRole: "company",
        reason: "missingDisclosure",
      },
      companyResult,
    );
    const operatorId = await seedOperatorId(t, "operator");
    await override(t, operatorId, disputeId);

    const view = await t.run(
      async (ctx) => await requireDispute(ctx, creatorOf(fixture), disputeId),
    );

    expect(view).not.toHaveProperty("openedBy");
    expect(view).not.toHaveProperty("resolvedBy");
    expect(view).toMatchObject({
      openedByRole: "company",
      status: "resolved",
      resolvedByRole: "operator",
      outcome: "denied",
      overriddenResolution: { resolvedByRole: "company", outcome: "approved" },
    });
    expect(view.status === "resolved" && view.overriddenResolution).not.toHaveProperty(
      "resolvedBy",
    );
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
    await resolve(t, operator, operatorId, closedLast);
    vi.advanceTimersByTime(1000);
    await resolve(t, operator, operatorId, closedFirst);

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

describe("dispute effects", () => {
  const approveDraft = (submissionId: Id<"submissions">) =>
    ({ effect: { kind: "approveDraft", submissionId } }) as const;

  /** An open unfair-review dispute on an assignment whose only draft got a change request. */
  async function seedReviewDispute(t: TestConvex) {
    const fixture = await seedAssignmentFixture(t);
    const submissionId = await seedSubmission(t, fixture, "changesRequested");
    const disputeId = await seedDispute(t, fixture);
    const operatorId = await seedOperatorId(t, "operator");
    return { fixture, submissionId, disputeId, operatorId };
  }

  test("Tomoji's approval replaces the change request and keeps it on record", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId, disputeId, operatorId } = await seedReviewDispute(t);

    const result = await resolve(t, operator, operatorId, disputeId, approveDraft(submissionId));

    const stored = await storedSubmission(t, submissionId);
    expect(stored).toMatchObject({
      status: "approved",
      reviewerType: "operator",
      reviewedByOperator: operatorId,
      reviewedAt: Date.now(),
      disputeId,
      overriddenReview: {
        status: "changesRequested",
        reviewNote: "Add #ad to the caption before posting.",
        reviewerType: "companyUser",
        reviewedBy: fixture.membership._id,
      },
    });
    expect(stored).not.toHaveProperty("reviewedBy");
    expect(result).toMatchObject({
      status: "resolved",
      outcome: "approved",
      effect: { kind: "approveDraft", submissionId },
    });
    expect(await creatorNotifications(t, fixture.creatorId)).toEqual([
      expect.objectContaining({
        type: "submissionApproved",
        target: { kind: "submission", submissionId, assignmentId: fixture.assignmentId },
      }),
    ]);
  });

  test("applies when Tomoji overrides the opener's result", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const submissionId = await seedSubmission(t, fixture, "changesRequested");
    const disputeId = await seedDispute(
      t,
      fixture,
      {},
      { ...pastRuling, resolvedBy: fixture.creatorUserId, outcome: "denied" },
    );
    const operatorId = await seedOperatorId(t, "operator");

    const result = await override(t, operatorId, disputeId, {
      outcome: "approved",
      ...approveDraft(submissionId),
    });

    expect(result.effect).toEqual({ kind: "approveDraft", submissionId });
    expect(await storedSubmission(t, submissionId)).toMatchObject({
      status: "approved",
      reviewerType: "operator",
    });
  });

  test("only Tomoji can apply an effect", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId, disputeId } = await seedReviewDispute(t);
    const before = await storedSubmissions(t);

    await expect(
      resolve(t, creatorOf(fixture), fixture.creatorUserId, disputeId, approveDraft(submissionId)),
    ).rejects.toMatchObject({ data: { code: "forbidden", reason: "effect_operator_only" } });
    expect(await storedSubmissions(t)).toEqual(before);
  });

  test("refuses an effect without approving", async () => {
    const t = convexTest(schema, modules);
    const { submissionId, disputeId, operatorId } = await seedReviewDispute(t);

    await expect(
      resolve(t, operator, operatorId, disputeId, {
        outcome: "denied",
        ...approveDraft(submissionId),
      }),
    ).rejects.toMatchObject({
      data: { code: "invalid_state", reason: "effect_requires_approval" },
    });
  });

  test("applies whatever the dispute's reason", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const submissionId = await seedSubmission(t, fixture, "changesRequested");
    const disputeId = await seedDispute(t, fixture, { reason: "paymentNotReceived" });
    const operatorId = await seedOperatorId(t, "operator");

    const result = await resolve(t, operator, operatorId, disputeId, approveDraft(submissionId));

    expect(result).toMatchObject({ effect: { kind: "approveDraft", submissionId } });
  });

  test("leaves the dispute open when the effect can't be applied", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId, disputeId, operatorId } = await seedReviewDispute(t);
    await seedSubmission(t, fixture, "pending");

    await expect(
      resolve(t, operator, operatorId, disputeId, approveDraft(submissionId)),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "submission_pending" } });
    const [dispute] = await storedDisputes(t);
    expect(dispute.status).toBe("open");
  });

  test("refuses a draft that a newer review has replaced, without changing either", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId, disputeId, operatorId } = await seedReviewDispute(t);
    // The creator resubmitted and the company reviewed the new draft before Tomoji ruled.
    await seedSubmission(t, fixture, "changesRequested");
    const before = await storedSubmissions(t);

    await expect(
      resolve(t, operator, operatorId, disputeId, approveDraft(submissionId)),
    ).rejects.toMatchObject({ data: { code: "conflict", reason: "submission_not_latest" } });
    expect(await storedSubmissions(t)).toEqual(before);
  });
});

describe("requestChanges effect", () => {
  const reviewNote = "  Add #ad in the first 5 seconds, as the brief requires.  ";
  const requestChanges = (submissionId: Id<"submissions">) =>
    ({ effect: { kind: "requestChanges", submissionId, reviewNote } }) as const;

  /** An open missing-disclosure dispute from the company on an approved draft. */
  async function seedDisclosureDispute(t: TestConvex) {
    const fixture = await seedAssignmentFixture(t);
    const submissionId = await seedSubmission(t, fixture, "approved");
    const disputeId = await seedDispute(t, fixture, {
      reason: "missingDisclosure",
      openedBy: fixture.membership.userId,
      openedByRole: "company",
    });
    const operatorId = await seedOperatorId(t, "operator");
    return { fixture, submissionId, disputeId, operatorId };
  }

  test("sends the approved draft back with Tomoji's note", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId, disputeId, operatorId } = await seedDisclosureDispute(t);

    const result = await resolve(t, operator, operatorId, disputeId, requestChanges(submissionId));

    expect(await storedSubmission(t, submissionId)).toMatchObject({
      status: "changesRequested",
      reviewNote: "Add #ad in the first 5 seconds, as the brief requires.",
      reviewerType: "operator",
      reviewedByOperator: operatorId,
      disputeId,
      overriddenReview: {
        status: "approved",
        reviewerType: "companyUser",
        reviewedBy: fixture.membership._id,
      },
    });
    expect(result).toMatchObject({ effect: { kind: "requestChanges", submissionId } });
    expect(await creatorNotifications(t, fixture.creatorId)).toEqual([
      expect.objectContaining({
        type: "submissionChangesRequested",
        body: "Add #ad in the first 5 seconds, as the brief requires.",
      }),
    ]);
  });

  test("lets the creator submit a new draft afterwards", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId, disputeId, operatorId } = await seedDisclosureDispute(t);
    await resolve(t, operator, operatorId, disputeId, requestChanges(submissionId));

    const newDraftId = await t.run(
      async (ctx) =>
        await createSubmission(ctx, fixture.creatorId, {
          assignmentId: fixture.assignmentId,
          draftUrl: "https://drive.example.com/drafts/driftwood-with-disclosure",
          draftDescription: "Same cut with #ad on screen from 0:00.",
        }),
    );

    expect(await storedSubmission(t, newDraftId)).toMatchObject({ status: "pending" });
  });

  test("requires a note", async () => {
    const t = convexTest(schema, modules);
    const { submissionId, disputeId, operatorId } = await seedDisclosureDispute(t);

    await expect(
      resolve(t, operator, operatorId, disputeId, {
        effect: { kind: "requestChanges", submissionId, reviewNote: "   " },
      }),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "reviewNote_blank" } });
    const [dispute] = await storedDisputes(t);
    expect(dispute.status).toBe("open");
  });
});

describe("cancelAssignment effect", () => {
  const cancelAssignment = { effect: { kind: "cancelAssignment" } } as const;

  /** An open dispute from the company about a post the creator published without approval. */
  async function seedPostDispute(t: TestConvex, status: "active" | "termsPending" = "active") {
    const fixture = await seedAssignmentFixture(t, { status });
    const disputeId = await seedDispute(t, fixture, {
      reason: "publishedWithoutApproval",
      openedBy: fixture.membership.userId,
      openedByRole: "company",
    });
    const operatorId = await seedOperatorId(t, "operator");
    return { fixture, disputeId, operatorId };
  }

  async function storedAssignment(t: TestConvex, fixture: AssignmentFixture) {
    return await t.run(async (ctx) => {
      const assignment = await ctx.db.get("assignments", fixture.assignmentId);
      if (assignment === null) throw new Error("expected seeded assignment");
      const opportunity = await ctx.db.get("opportunities", assignment.opportunityId);
      return { assignment, opportunity };
    });
  }

  test("cancels the active assignment, frees its slot, and tells the creator", async () => {
    const t = convexTest(schema, modules);
    const { fixture, disputeId, operatorId } = await seedPostDispute(t);
    const { opportunity } = await storedAssignment(t, fixture);
    await t.run(
      async (ctx) => await ctx.db.patch("opportunities", opportunity!._id, { numFilledSlots: 1 }),
    );

    const result = await resolve(t, operator, operatorId, disputeId, cancelAssignment);

    const after = await storedAssignment(t, fixture);
    expect(after.assignment.status).toBe("cancelled");
    expect(after.opportunity?.numFilledSlots).toBe(0);
    expect(result).toMatchObject({ effect: { kind: "cancelAssignment" } });
    expect(await creatorNotifications(t, fixture.creatorId)).toEqual([
      expect.objectContaining({
        type: "assignmentCancelled",
        target: { kind: "assignment", assignmentId: fixture.assignmentId },
      }),
    ]);
  });

  test("refuses an assignment whose terms are still pending", async () => {
    const t = convexTest(schema, modules);
    const { fixture, disputeId, operatorId } = await seedPostDispute(t, "termsPending");

    await expect(
      resolve(t, operator, operatorId, disputeId, cancelAssignment),
    ).rejects.toMatchObject({ data: { code: "invalid_state", reason: "assignment_not_active" } });
    expect((await storedAssignment(t, fixture)).assignment.status).toBe("termsPending");
    const [dispute] = await storedDisputes(t);
    expect(dispute.status).toBe("open");
  });
});
