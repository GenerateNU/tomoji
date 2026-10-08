/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AssignmentViewer } from "../../models/assignments";
import {
  createDispute,
  listDisputes,
  requireDispute,
  type DisputeDraft,
} from "../../models/disputes";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignment,
  seedAssignmentFixture,
  seedCreatorId,
  seedDispute,
  seedMembership,
  seedOneSubmission,
  seedSubmission,
  storedDisputes,
  type AssignmentFixture,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
});

afterEach(() => vi.useRealTimers());

const firstPage = { numItems: 10, cursor: null };

function creatorOf(fixture: AssignmentFixture): AssignmentViewer {
  return { role: "creator", creatorId: fixture.creatorId };
}

function companyOf(fixture: AssignmentFixture): AssignmentViewer {
  return { role: "company", companyId: fixture.membership.companyId };
}

/** Opens a dispute on the fixture's assignment as its creator, with untrimmed text. */
async function openAsCreator(
  t: TestConvex,
  fixture: AssignmentFixture,
  overrides: Partial<DisputeDraft> = {},
  viewer: AssignmentViewer = creatorOf(fixture),
) {
  const draft: DisputeDraft = {
    assignmentId: fixture.assignmentId,
    reason: "  Payment not received  ",
    description: "  The video went live on Oct 1 and the fixed fee hasn't arrived.  ",
    ...overrides,
  };
  return await t.run(async (ctx) => await createDispute(ctx, viewer, fixture.creatorUserId, draft));
}

describe("createDispute", () => {
  test("stores a trimmed, open dispute with the opener and their role", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    const disputeId = await openAsCreator(t, fixture);

    expect(await storedDisputes(t)).toEqual([
      {
        _id: disputeId,
        _creationTime: expect.any(Number),
        assignmentId: fixture.assignmentId,
        openedBy: fixture.creatorUserId,
        openedByRole: "creator",
        reason: "Payment not received",
        description: "The video went live on Oct 1 and the fixed fee hasn't arrived.",
        isResolved: false,
      },
    ]);
  });

  test.each(["termsPending", "active", "completed", "cancelled"] as const)(
    "allows a %s assignment",
    async (status) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignmentFixture(t, { status });

      await openAsCreator(t, fixture);

      expect(await storedDisputes(t)).toHaveLength(1);
    },
  );

  test("allows several disputes on one assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    await openAsCreator(t, fixture);
    await openAsCreator(t, fixture);

    expect(await storedDisputes(t)).toHaveLength(2);
  });

  test("links a submission on the same assignment", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, "changesRequested");

    await openAsCreator(t, fixture, { submissionId });

    const [stored] = await storedDisputes(t);
    expect(stored.submissionId).toBe(submissionId);
  });

  test("conceals a submission from another assignment without writing", async () => {
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
    const submissionId = await seedSubmission(
      t,
      { ...fixture, assignmentId: otherAssignmentId },
      "pending",
    );

    await expect(openAsCreator(t, fixture, { submissionId })).rejects.toMatchObject({
      data: { code: "not_found", resource: "submission" },
    });
    expect(await storedDisputes(t)).toEqual([]);
  });

  test("conceals another creator's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const otherCreatorId = await seedCreatorId(t, "other-creator");

    await expectApiError(
      () => openAsCreator(t, fixture, {}, { role: "creator", creatorId: otherCreatorId }),
      "not_found",
    );
  });

  test.each([
    ["a blank reason", { reason: "   " }, "reason_blank"],
    ["a blank description", { description: "" }, "description_blank"],
    ["a reason over 200 characters", { reason: "x".repeat(201) }, "reason_too_long"],
    [
      "a description over 5000 characters",
      { description: "x".repeat(5001) },
      "description_too_long",
    ],
  ] as const)("refuses %s without writing", async (_case, overrides, reason) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    await expect(openAsCreator(t, fixture, overrides)).rejects.toMatchObject({
      data: { code: "invalid_state", reason },
    });
    expect(await storedDisputes(t)).toEqual([]);
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
      isResolved: true,
      resolvedBy: fixture.membership.userId,
      resolution: "Paid out manually.",
    });

    const view = await t.run(
      async (ctx) => await requireDispute(ctx, creatorOf(fixture), disputeId),
    );

    expect(view).not.toHaveProperty("openedBy");
    expect(view).not.toHaveProperty("resolvedBy");
    expect(view).toMatchObject({ openedByRole: "company", resolution: "Paid out manually." });
  });

  test("conceals a dispute on another company's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);
    const { membership } = await seedMembership(t, "outsider");
    const outsider: AssignmentViewer = { role: "company", companyId: membership.companyId };

    await expectApiError(
      () => t.run(async (ctx) => await requireDispute(ctx, outsider, disputeId)),
      "not_found",
    );
  });
});

describe("listDisputes", () => {
  test("lists an assignment's disputes newest first, resolved or not", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const older = await seedDispute(t, fixture, { isResolved: true, resolution: "Settled." });
    vi.advanceTimersByTime(1000);
    const newer = await seedDispute(t, fixture);

    const { page } = await t.run(
      async (ctx) => await listDisputes(ctx, companyOf(fixture), fixture.assignmentId, firstPage),
    );

    expect(page.map((dispute) => dispute._id)).toEqual([newer, older]);
  });

  test("gives each row the same view as requireDispute", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const disputeId = await seedDispute(t, fixture);

    const { page, single } = await t.run(async (ctx) => ({
      page: (await listDisputes(ctx, creatorOf(fixture), fixture.assignmentId, firstPage)).page,
      single: await requireDispute(ctx, creatorOf(fixture), disputeId),
    }));

    expect(page).toEqual([single]);
  });
});
