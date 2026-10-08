/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { AssignmentViewer } from "../../models/assignments";
import {
  createDispute,
  listDisputes,
  requireDispute,
  type DisputeDraft,
  type DisputeListFilters,
} from "../../models/disputes";
import schema from "../../schema";
import { companyDisputeReasons, creatorDisputeReasons } from "../../schemas/disputes.schema";
import {
  expectApiError,
  seedAssignmentFixture,
  seedCreatorId,
  seedDispute,
  seedMembership,
  seedOneSubmission,
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

async function list(t: TestConvex, viewer: AssignmentViewer, filters: Partial<DisputeListFilters>) {
  const { page } = await t.run(
    async (ctx) =>
      await listDisputes(ctx, viewer, { status: "open", paginationOpts: firstPage, ...filters }),
  );
  return page.map((dispute) => dispute._id);
}

async function insertPost(t: TestConvex, submissionId: Id<"submissions">) {
  return await t.run(
    async (ctx) =>
      await ctx.db.insert("posts", {
        submissionId,
        url: "https://www.tiktok.com/@julia/video/1",
        postedAt: Date.now(),
        isVerified: true,
      }),
  );
}

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
    const postId = await insertPost(t, submissionId);

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

    await open(t, fixture, { reason: "missingDisclosure" }, { role: "operator" });
    await open(t, fixture, { reason: "payoutAmount" }, { role: "operator" });

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

describe("requireDispute", () => {
  test("gives company users and operators the stored row", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const [stored] = await storedDisputes(t);

    for (const viewer of [companyOf(fixture), { role: "operator" } as const]) {
      const view = await t.run(async (ctx) => await requireDispute(ctx, viewer, disputeId));
      expect(view).toEqual(stored);
    }
  });

  test("gives creators the side that opened it and the resolution, but no user IDs", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture, {
      openedBy: fixture.membership.userId,
      openedByRole: "company",
      reason: "missingDisclosure",
      status: "resolved",
      resolvedBy: fixture.membership.userId,
      resolution: "Disclosure added; no further action.",
    });

    const view = await t.run(
      async (ctx) => await requireDispute(ctx, creatorOf(fixture), disputeId),
    );

    expect(view).not.toHaveProperty("openedBy");
    expect(view).not.toHaveProperty("resolvedBy");
    expect(view).toMatchObject({
      openedByRole: "company",
      resolution: "Disclosure added; no further action.",
    });
  });

  test("reports another company's dispute and a missing one the same way", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const { membership } = await seedMembership(t, "outsider");
    const outsider: AssignmentViewer = { role: "company", companyId: membership.companyId };
    const missingId = await seedDispute(t, fixture);
    await t.run(async (ctx) => await ctx.db.delete("disputes", missingId));

    for (const id of [disputeId, missingId]) {
      const viewer = id === disputeId ? outsider : companyOf(fixture);
      await expect(
        t.run(async (ctx) => await requireDispute(ctx, viewer, id)),
      ).rejects.toMatchObject({ data: { code: "not_found", resource: "dispute" } });
    }
  });
});

describe("listDisputes", () => {
  test("lists only the company's disputes in the given status, newest first", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const older = await seedDispute(t, fixture);
    vi.advanceTimersByTime(1000);
    const newer = await seedDispute(t, fixture);
    const resolved = await seedDispute(t, fixture, { status: "resolved" });

    expect(await list(t, companyOf(fixture), { status: "open" })).toEqual([newer, older]);
    expect(await list(t, companyOf(fixture), { status: "resolved" })).toEqual([resolved]);
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
  });

  test("lists the creator's disputes and nobody else's", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const otherCreatorId = await seedCreatorId(t, "other-creator");

    expect(await list(t, creatorOf(fixture), {})).toEqual([disputeId]);
    expect(await list(t, { role: "creator", creatorId: otherCreatorId }, {})).toEqual([]);
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

  test("refuses operators, who will have their own queue", async () => {
    const t = convexTest(schema, modules);

    await expectApiError(() => list(t, { role: "operator" }, {}), "forbidden");
  });
});
