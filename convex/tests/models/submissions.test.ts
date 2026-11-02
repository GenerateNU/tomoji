/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import {
  createSubmission,
  listSubmissions,
  requireSubmission,
  reviewSubmission,
  toSubmissionView,
  type SubmissionDraft,
  type SubmissionReview,
  type SubmissionViewer,
} from "../../models/submissions";
import { listOpportunityDeliverables } from "../../models/deliverableDrafts";
import { markAiReviewForManualReview, finishAiReview } from "../../models/aiReviewAttempts";
import schema from "../../schema";
import {
  prepareAiReviewEvaluation,
  aiReviewResultArgs,
  seedAiReviewFixture,
  creatorNotifications,
  expectApiError,
  submissionArgs,
  submissionDraftFields as draft,
  expectedSubmissionView as expectedFull,
  memberNotifications,
  seedAssignmentFixture,
  seedCreatorId,
  seedDeliverable,
  seedMembership,
  seedOneSubmission,
  seedOpportunity,
  seedSubmission,
  storedSubmission,
  storedSubmissions,
  withoutReviewerIdentity,
  type AssignmentFixture,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
afterEach(() => vi.unstubAllEnvs());

const firstPage = { numItems: 10, cursor: null as string | null };

/** Calls the model with shared draft fields while preserving per-test owner and input overrides. */
async function submit(
  t: TestConvex,
  fixture: AssignmentFixture,
  overrides: Partial<SubmissionDraft> = {},
  creatorId: Id<"creators"> = fixture.creatorId,
) {
  return await t.run(
    async (ctx) => await createSubmission(ctx, creatorId, submissionArgs(fixture, overrides)),
  );
}

async function reviewAs(
  t: TestConvex,
  membership: Doc<"companyUsers">,
  submissionId: Id<"submissions">,
  review: SubmissionReview,
) {
  return await t.run(async (ctx) => await reviewSubmission(ctx, membership, submissionId, review));
}

const creatorViewer = (fixture: AssignmentFixture): SubmissionViewer => ({
  role: "creator",
  creatorId: fixture.creatorId,
});
const companyViewer = (fixture: AssignmentFixture): SubmissionViewer => ({
  role: "company",
  companyId: fixture.membership.companyId,
});
const operatorViewer: SubmissionViewer = { role: "operator" };

async function getAs(t: TestConvex, viewer: SubmissionViewer, submissionId: Id<"submissions">) {
  return await t.run(async (ctx) => await requireSubmission(ctx, viewer, submissionId));
}

async function listAs(
  t: TestConvex,
  viewer: SubmissionViewer,
  fixture: AssignmentFixture,
  paginationOpts = firstPage,
  deliverableId = fixture.deliverableId,
) {
  return await t.run(
    async (ctx) =>
      await listSubmissions(ctx, viewer, fixture.assignmentId, deliverableId, paginationOpts),
  );
}

describe("createSubmission", () => {
  test.each([true, false])(
    "stores a pending draft and copies usesAiReview=%s from the assignment",
    async (usesAiReview) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignmentFixture(t, { usesAiReview });

      const id = await submit(t, fixture);

      expect(await storedSubmission(t, id)).toMatchObject({
        assignmentId: fixture.assignmentId,
        deliverableId: fixture.deliverableId,
        ...draft,
        mediaId: fixture.mediaId,
        status: "pending",
        usesAiReview,
      });
    },
  );

  test("trims the draft fields", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    const id = await submit(t, fixture, {
      draftDescription: `  ${draft.draftDescription}\n`,
    });

    expect(await storedSubmission(t, id)).toMatchObject(draft);
  });

  test("rejects another creator's assignment without writing a submission", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const intruderId = await seedCreatorId(t, "cs-intruder");

    await expectApiError(() => submit(t, fixture, {}, intruderId), "not_found");

    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  test("rejects an assignment that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await t.run(async (ctx) => await ctx.db.delete("assignments", fixture.assignmentId));

    await expectApiError(() => submit(t, fixture), "not_found");
  });

  test.each(["termsPending", "completed", "cancelled"] as const)(
    "rejects a %s assignment without writing a submission",
    async (status) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignmentFixture(t, { status });

      await expectApiError(() => submit(t, fixture), "invalid_state", "assignment_not_active");

      expect(await storedSubmissions(t)).toHaveLength(0);
    },
  );

  test("rejects a new draft while one is pending", async () => {
    const t = convexTest(schema, modules);
    const { fixture } = await seedOneSubmission(t);

    await expectApiError(() => submit(t, fixture), "conflict", "submission_pending");

    expect(await storedSubmissions(t)).toHaveLength(1);
  });

  test("rejects a new draft once one is approved", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await seedSubmission(t, fixture, "changesRequested");
    await seedSubmission(t, fixture, "approved");

    await expectApiError(() => submit(t, fixture), "invalid_state", "already_approved");

    expect(await storedSubmissions(t)).toHaveLength(2);
  });

  test("accepts a resubmission after changes are requested", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: firstId } = await seedOneSubmission(t, "changesRequested");

    const secondId = await submit(t, fixture);
    const stored = await storedSubmissions(t);

    expect(stored.map((s) => [s._id, s.status])).toEqual([
      [firstId, "changesRequested"],
      [secondId, "pending"],
    ]);
  });

  test("lets a creator submit one deliverable while another is pending or approved", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const secondId = await seedDeliverable(t, fixture);
    const thirdId = await seedDeliverable(t, fixture);
    await seedSubmission(t, fixture, "approved");
    await submit(t, fixture, { deliverableId: secondId });

    const id = await submit(t, fixture, { deliverableId: thirdId });

    expect(await storedSubmission(t, id)).toMatchObject({ deliverableId: thirdId });
    // The rules still hold per deliverable.
    await expectApiError(
      () => submit(t, fixture, { deliverableId: secondId }),
      "conflict",
      "submission_pending",
    );
    await expectApiError(() => submit(t, fixture), "invalid_state", "already_approved");
  });

  test("rejects a deliverable from another opportunity without writing a submission", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const other = await seedOpportunity(t, { subject: "cs-other-company", orgId: "org_other" });
    const [otherDeliverable] = await t.run((ctx) =>
      listOpportunityDeliverables(ctx, other.opportunityId),
    );
    const deleted = await seedDeliverable(t, fixture);
    await t.run(async (ctx) => await ctx.db.delete("deliverables", deleted));

    for (const deliverableId of [otherDeliverable._id, deleted]) {
      await expect(submit(t, fixture, { deliverableId })).rejects.toMatchObject({
        data: { code: "not_found", resource: "deliverable" },
      });
    }
    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  test("rejects a blank description without writing a submission", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await expectApiError(
      () => submit(t, fixture, { draftDescription: " \n " }),
      "invalid_state",
      "draftDescription_blank",
    );
    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  test("rejects a description over the length limit", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await expectApiError(
      () => submit(t, fixture, { draftDescription: "a".repeat(5001) }),
      "invalid_state",
      "draftDescription_too_long",
    );
    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  test("accepts a description exactly at the limit, measured after trimming", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const description = "a".repeat(5000);

    const id = await submit(t, fixture, { draftDescription: `  ${description}  ` });

    expect(await storedSubmission(t, id)).toMatchObject({ draftDescription: description });
  });

  // TODO(dueAt): implement once assignments have a dueAt field.
  test.todo("rejects drafts and resubmissions after assignment.dueAt");
});

describe("reviewSubmission", () => {
  test("approves a pending draft and attributes the review to the caller", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t);

    const before = Date.now();
    const reviewed = await reviewAs(t, fixture.membership, id, { status: "approved" });
    const after = Date.now();

    expect(reviewed).toMatchObject({
      _id: id,
      status: "approved",
      reviewerType: "companyUser",
      reviewedBy: fixture.membership._id,
    });
    expect(reviewed.reviewNote).toBeUndefined();
    expect(reviewed.reviewedAt).toBeGreaterThanOrEqual(before);
    expect(reviewed.reviewedAt).toBeLessThanOrEqual(after);
    expect(await storedSubmission(t, id)).toEqual(reviewed);
  });

  test("stores a trimmed note on an approval", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t);

    const reviewed = await reviewAs(t, fixture.membership, id, {
      status: "approved",
      reviewNote: "  Clear terminal font and a clean first deploy.  ",
    });

    expect(reviewed.reviewNote).toBe("Clear terminal font and a clean first deploy.");
  });

  test("requests changes with a note", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t);

    const reviewed = await reviewAs(t, fixture.membership, id, {
      status: "changesRequested",
      reviewNote: "Blur the API key visible in the terminal at 0:32.",
    });

    expect(reviewed).toMatchObject({
      status: "changesRequested",
      reviewNote: "Blur the API key visible in the terminal at 0:32.",
      reviewerType: "companyUser",
      reviewedBy: fixture.membership._id,
    });
  });

  test.each(["", "  \n"])("stores no note when an approval's note is blank (%j)", async (note) => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t);

    const reviewed = await reviewAs(t, fixture.membership, id, {
      status: "approved",
      reviewNote: note,
    });

    expect(reviewed).toMatchObject({ status: "approved" });
    expect(reviewed.reviewNote).toBeUndefined();
    expect(await storedSubmission(t, id)).toEqual(reviewed);
  });

  test("rejects a blank note on a change request without reviewing", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t);

    await expectApiError(
      () => reviewAs(t, fixture.membership, id, { status: "changesRequested", reviewNote: "  \n" }),
      "invalid_state",
      "reviewNote_blank",
    );

    expect(await storedSubmission(t, id)).toMatchObject({ status: "pending" });
  });

  test.each(["approved", "changesRequested"] as const)(
    "rejects a note over the length limit on %s without reviewing",
    async (status) => {
      const t = convexTest(schema, modules);
      const { fixture, submissionId: id } = await seedOneSubmission(t);

      await expectApiError(
        () => reviewAs(t, fixture.membership, id, { status, reviewNote: "a".repeat(2001) }),
        "invalid_state",
        "reviewNote_too_long",
      );

      expect(await storedSubmission(t, id)).toMatchObject({ status: "pending" });
    },
  );

  test("accepts a note exactly at the limit", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t);

    const reviewed = await reviewAs(t, fixture.membership, id, {
      status: "changesRequested",
      reviewNote: "a".repeat(2000),
    });

    expect(reviewed.reviewNote).toHaveLength(2000);
  });

  test("rejects a member of another company without reviewing", async () => {
    const t = convexTest(schema, modules);
    const { submissionId: id } = await seedOneSubmission(t);
    const { membership: outsider } = await seedMembership(t, "rs-outsider");

    await expectApiError(() => reviewAs(t, outsider, id, { status: "approved" }), "not_found");

    expect(await storedSubmission(t, id)).toMatchObject({ status: "pending" });
  });

  test("rejects a submission that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t);
    await t.run(async (ctx) => await ctx.db.delete("submissions", id));

    await expectApiError(
      () => reviewAs(t, fixture.membership, id, { status: "approved" }),
      "not_found",
    );
  });

  test.each(["approved", "changesRequested"] as const)(
    "rejects a submission already %s without changing it",
    async (status) => {
      const t = convexTest(schema, modules);
      const { fixture, submissionId: id } = await seedOneSubmission(t, status);
      const original = await storedSubmission(t, id);

      await expectApiError(
        () => reviewAs(t, fixture.membership, id, { status: "approved" }),
        "invalid_state",
        "already_reviewed",
      );

      expect(await storedSubmission(t, id)).toEqual(original);
    },
  );

  test.each(["completed", "cancelled"] as const)(
    "rejects a pending draft on a %s assignment without reviewing",
    async (status) => {
      const t = convexTest(schema, modules);
      const { fixture, submissionId: id } = await seedOneSubmission(t, "pending", { status });

      await expectApiError(
        () => reviewAs(t, fixture.membership, id, { status: "approved" }),
        "invalid_state",
        "assignment_not_active",
      );

      expect(await storedSubmission(t, id)).toMatchObject({ status: "pending" });
    },
  );

  // TODO(ai-layer): once AI review exists, submissions with usesAiReview are
  // reviewed only by the AI; flip this test to expect a rejection.
  test("lets a company user review a submission that uses AI review", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t, "pending", {
      usesAiReview: true,
    });

    const reviewed = await reviewAs(t, fixture.membership, id, { status: "approved" });

    expect(reviewed).toMatchObject({
      usesAiReview: true,
      status: "approved",
      reviewerType: "companyUser",
    });
  });
});

describe("closedWithoutReview", () => {
  async function readAll(t: TestConvex, fixture: AssignmentFixture, id: Id<"submissions">) {
    return [
      await getAs(t, operatorViewer, id),
      (await listAs(t, operatorViewer, fixture)).page[0],
      await getAs(t, creatorViewer(fixture), id),
      (await listAs(t, creatorViewer(fixture), fixture)).page[0],
    ];
  }

  test.each(["completed", "cancelled"] as const)(
    "marks a pending draft on a %s assignment in every read",
    async (status) => {
      const t = convexTest(schema, modules);
      const { fixture, submissionId: id } = await seedOneSubmission(t, "pending", {
        status,
      });

      for (const view of await readAll(t, fixture, id)) {
        expect(view).toHaveProperty("closedWithoutReview", true);
      }
    },
  );

  test("leaves a pending draft on an active assignment open in every read", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t);

    for (const view of await readAll(t, fixture, id)) {
      expect(view).toHaveProperty("closedWithoutReview", false);
    }
  });

  test.each(["approved", "changesRequested"] as const)(
    "doesn't mark a %s submission on a cancelled assignment",
    async (reviewStatus) => {
      const t = convexTest(schema, modules);
      const { fixture, submissionId: id } = await seedOneSubmission(t, reviewStatus, {
        status: "cancelled",
      });

      for (const view of await readAll(t, fixture, id)) {
        expect(view).toHaveProperty("closedWithoutReview", false);
      }
    },
  );
});

describe("toSubmissionView", () => {
  const base = {
    mediaId: "mediaUploads|1" as Id<"mediaUploads">,
    _id: "submissions|1" as Id<"submissions">,
    _creationTime: 1,
    assignmentId: "assignments|1" as Id<"assignments">,
    deliverableId: "deliverables|1" as Id<"deliverables">,
    ...draft,
    usesAiReview: false,
  };
  const creator: SubmissionViewer = { role: "creator", creatorId: "creators|1" as Id<"creators"> };
  const company: SubmissionViewer = {
    role: "company",
    companyId: "companies|1" as Id<"companies">,
  };

  const companyReviewed: Doc<"submissions"> = {
    ...base,
    status: "changesRequested",
    reviewNote: "Add #ad to the caption before posting.",
    reviewerType: "companyUser",
    reviewedBy: "companyUsers|1" as Id<"companyUsers">,
    reviewedAt: 2,
  };
  const overridden: Doc<"submissions"> = {
    ...base,
    status: "approved",
    reviewerType: "operator",
    reviewedByOperator: "users|1" as Id<"users">,
    reviewedAt: 3,
    overriddenReview: {
      status: "changesRequested",
      reviewNote: "Cut the deploy log at 0:40.",
      reviewerType: "companyUser",
      reviewedBy: "companyUsers|1" as Id<"companyUsers">,
      reviewedAt: 2,
    },
    disputeId: "disputes|1" as Id<"disputes">,
  };

  test.each([
    ["a company user", company],
    ["an operator", operatorViewer],
  ])("gives %s the stored row plus the flag", (_label, viewer) => {
    expect(toSubmissionView(viewer, overridden, false)).toEqual({
      ...overridden,
      closedWithoutReview: false,
    });
  });

  test("gives a creator a pending draft unchanged, plus the flag", () => {
    const pending: Doc<"submissions"> = { ...base, status: "pending" };

    expect(toSubmissionView(creator, pending, true)).toEqual({
      ...pending,
      closedWithoutReview: true,
    });
  });

  test("gives a creator a company review's outcome without the reviewer", () => {
    expect(toSubmissionView(creator, companyReviewed, false)).toEqual({
      ...base,
      status: "changesRequested",
      reviewNote: "Add #ad to the caption before posting.",
      reviewerType: "companyUser",
      reviewedAt: 2,
      closedWithoutReview: false,
    });
  });

  test("gives a creator the replaced review and the dispute, without any reviewer", () => {
    expect(toSubmissionView(creator, overridden, false)).toEqual({
      ...base,
      status: "approved",
      reviewerType: "operator",
      reviewedAt: 3,
      overriddenReview: {
        status: "changesRequested",
        reviewNote: "Cut the deploy log at 0:40.",
        reviewerType: "companyUser",
        reviewedAt: 2,
      },
      disputeId: "disputes|1",
      closedWithoutReview: false,
    });
  });
});

describe("requireSubmission", () => {
  test("gives a creator their own submission without the reviewer", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t, "changesRequested");

    const view = await getAs(t, creatorViewer(fixture), id);

    expect(view).toEqual(withoutReviewerIdentity(await expectedFull(t, id)));
  });

  test("gives the company its submission with reviewer details", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t, "approved");

    const view = await getAs(t, companyViewer(fixture), id);

    expect(view).toEqual(await expectedFull(t, id));
    expect(view).toHaveProperty("reviewedBy", fixture.membership._id);
  });

  test("gives an operator any submission in full", async () => {
    const t = convexTest(schema, modules);
    const { submissionId: id } = await seedOneSubmission(t, "approved");

    expect(await getAs(t, operatorViewer, id)).toEqual(await expectedFull(t, id));
  });

  test("hides another creator's submission", async () => {
    const t = convexTest(schema, modules);
    const { submissionId: id } = await seedOneSubmission(t);
    const intruderId = await seedCreatorId(t, "gs-intruder");

    await expectApiError(
      () => getAs(t, { role: "creator", creatorId: intruderId }, id),
      "not_found",
    );
  });

  test("hides another company's submission", async () => {
    const t = convexTest(schema, modules);
    const { submissionId: id } = await seedOneSubmission(t);
    const { membership: outsider } = await seedMembership(t, "gs-outsider");

    await expectApiError(
      () => getAs(t, { role: "company", companyId: outsider.companyId }, id),
      "not_found",
    );
  });

  test("rejects a submission that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const { submissionId: id } = await seedOneSubmission(t);
    await t.run(async (ctx) => await ctx.db.delete("submissions", id));

    await expectApiError(() => getAs(t, operatorViewer, id), "not_found");
  });
});

describe("listSubmissions", () => {
  test("lists an assignment's submissions newest first", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const firstId = await seedSubmission(t, fixture, "changesRequested");
    const secondId = await seedSubmission(t, fixture, "pending");

    const result = await listAs(t, companyViewer(fixture), fixture);

    expect(result.page.map((s) => s._id)).toEqual([secondId, firstId]);
    expect(result.isDone).toBe(true);
  });

  test("paginates with the returned cursor", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const firstId = await seedSubmission(t, fixture, "changesRequested");
    const secondId = await seedSubmission(t, fixture, "pending");

    const pageOne = await listAs(t, operatorViewer, fixture, {
      numItems: 1,
      cursor: null,
    });
    const pageTwo = await listAs(t, operatorViewer, fixture, {
      numItems: 1,
      cursor: pageOne.continueCursor,
    });

    expect(pageOne.page.map((s) => s._id)).toEqual([secondId]);
    expect(pageTwo.page.map((s) => s._id)).toEqual([firstId]);
  });

  test("gives a creator every submission without reviewers", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const firstId = await seedSubmission(t, fixture, "changesRequested");
    const secondId = await seedSubmission(t, fixture, "approved");

    const result = await listAs(t, creatorViewer(fixture), fixture);

    expect(result.page).toEqual([
      withoutReviewerIdentity(await expectedFull(t, secondId)),
      withoutReviewerIdentity(await expectedFull(t, firstId)),
    ]);
  });

  test("returns an empty page for an assignment with no submissions", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    const result = await listAs(t, creatorViewer(fixture), fixture);

    expect(result.page).toEqual([]);
  });

  test("hides another creator's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const intruderId = await seedCreatorId(t, "ls-intruder");

    await expectApiError(
      () => listAs(t, { role: "creator", creatorId: intruderId }, fixture),
      "not_found",
    );
  });

  test("hides another company's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const { membership: outsider } = await seedMembership(t, "ls-outsider");

    await expectApiError(
      () => listAs(t, { role: "company", companyId: outsider.companyId }, fixture),
      "not_found",
    );
  });

  test("rejects an assignment that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await t.run(async (ctx) => await ctx.db.delete("assignments", fixture.assignmentId));

    await expectApiError(() => listAs(t, operatorViewer, fixture), "not_found");
  });

  test("lists only the given deliverable's drafts, newest first", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const otherId = await seedDeliverable(t, fixture);
    const firstId = await seedSubmission(t, fixture, "changesRequested");
    const otherDraftId = await seedSubmission(t, { ...fixture, deliverableId: otherId }, "pending");
    const secondId = await seedSubmission(t, fixture, "pending");

    const result = await listAs(t, companyViewer(fixture), fixture);
    const other = await listAs(t, companyViewer(fixture), fixture, firstPage, otherId);

    expect(result.page.map((s) => s._id)).toEqual([secondId, firstId]);
    expect(other.page.map((s) => s._id)).toEqual([otherDraftId]);
  });

  test("hides a deliverable from another opportunity", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const other = await seedOpportunity(t, { subject: "ls-other-company", orgId: "org_other" });
    const [otherDeliverable] = await t.run((ctx) =>
      listOpportunityDeliverables(ctx, other.opportunityId),
    );

    await expect(
      listAs(t, operatorViewer, fixture, firstPage, otherDeliverable._id),
    ).rejects.toMatchObject({ data: { code: "not_found", resource: "deliverable" } });
  });
});

describe("notifications", () => {
  const title = "Moisturizer launch video";

  test("a first draft notifies the member who created the opportunity", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    const submissionId = await submit(t, fixture);

    expect(await memberNotifications(t, fixture.membership)).toEqual([
      {
        type: "submissionCreated",
        title: `Test submitted a draft for ${title}`,
        target: { kind: "submission", submissionId, assignmentId: fixture.assignmentId },
      },
    ]);
  });

  test("a draft sent after a change request is reported as a resubmission", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await seedSubmission(t, fixture, "changesRequested");

    const submissionId = await submit(t, fixture);

    expect(await memberNotifications(t, fixture.membership)).toEqual([
      {
        type: "submissionResubmitted",
        title: `Test resubmitted a draft for ${title}`,
        target: { kind: "submission", submissionId, assignmentId: fixture.assignmentId },
      },
    ]);
  });

  test("an approval notifies the creator", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t);

    await reviewAs(t, fixture.membership, submissionId, { status: "approved" });

    expect(await creatorNotifications(t, fixture.creatorId)).toEqual([
      {
        type: "submissionApproved",
        title: `Your draft for ${title} was approved`,
        target: { kind: "submission", submissionId, assignmentId: fixture.assignmentId },
      },
    ]);
  });

  test("a change request notifies the creator with the review note", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t);

    await reviewAs(t, fixture.membership, submissionId, {
      status: "changesRequested",
      reviewNote: "  Add #ad to the caption.  ",
    });

    expect(await creatorNotifications(t, fixture.creatorId)).toEqual([
      {
        type: "submissionChangesRequested",
        title: `Changes requested on your draft for ${title}`,
        body: "Add #ad to the caption.",
        target: { kind: "submission", submissionId, assignmentId: fixture.assignmentId },
      },
    ]);
  });
});

test("paginated creator reads retain safe review outcomes on the second page", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);
  const result = aiReviewResultArgs();
  await prepareAiReviewEvaluation(t, fixture.attempt._id);
  await t.run(async (ctx) => {
    await finishAiReview(ctx, fixture.attempt._id, {
      ...result,
      results: [
        {
          ...result.results[0],
          outcome: "not_met",
          probabilities: { met: 0.02, not_met: 0.95, uncertain: 0.03 },
        },
      ],
    });
    await createSubmission(
      ctx,
      fixture.creatorId,
      submissionArgs(fixture, { mediaId: fixture.mediaId }),
    );
  });
  const viewer = { role: "creator" as const, creatorId: fixture.creatorId };
  const first = await t.run((ctx) =>
    listSubmissions(ctx, viewer, fixture.assignmentId, fixture.deliverableId, {
      numItems: 1,
      cursor: null,
    }),
  );
  expect(first.isDone).toBe(false);
  expect(first.page[0].aiReview).toEqual({ status: "manualReview", results: [] });
  const second = await t.run((ctx) =>
    listSubmissions(ctx, viewer, fixture.assignmentId, fixture.deliverableId, {
      numItems: 1,
      cursor: first.continueCursor,
    }),
  );
  expect(second.isDone).toBe(true);
  expect(second.page).toEqual([
    {
      _id: fixture.submissionId,
      _creationTime: expect.any(Number),
      assignmentId: fixture.assignmentId,
      deliverableId: fixture.deliverableId,
      mediaId: fixture.mediaId,
      draftDescription: "60-second walkthrough: install, `driftwood init`, first deploy at 0:45.",
      usesAiReview: true,
      closedWithoutReview: false,
      status: "changesRequested",
      reviewerType: "ai",
      reviewedAt: expect.any(Number),
      reviewNote: "Please address these spoken requirements: Mention Driftwood.",
      aiReview: { status: "completed", results: [{ criterionId: "product", outcome: "not_met" }] },
    },
  ]);
});

test("company review is blocked while an enabled AI workflow is processing", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);
  vi.stubEnv("AI_REVIEW_ENABLED", "true");
  // Model the queued state without running provider actions in this model test.
  await t.run((ctx) =>
    ctx.db.patch("aiReviewAttempts", fixture.attempt._id, { workflowId: "workflow-processing" }),
  );
  await expectApiError(
    () => reviewAs(t, fixture.membership, fixture.submissionId, { status: "approved" }),
    "invalid_state",
    "ai_review_processing",
  );
});

test("company review is allowed after an enabled AI workflow falls back", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);
  vi.stubEnv("AI_REVIEW_ENABLED", "true");
  await t.run(async (ctx) => {
    await ctx.db.patch("aiReviewAttempts", fixture.attempt._id, {
      workflowId: "workflow-fallback",
    });
    await markAiReviewForManualReview(ctx, fixture.attempt._id, "review_failed");
  });
  expect(
    await reviewAs(t, fixture.membership, fixture.submissionId, { status: "approved" }),
  ).toMatchObject({
    status: "approved",
    reviewerType: "companyUser",
    reviewedBy: fixture.membership._id,
  });
});
