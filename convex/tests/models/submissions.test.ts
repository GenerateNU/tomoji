/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ApiErrorCode } from "../../lib/errors";
import type { Viewer } from "../../lib/functions";
import {
  createSubmission,
  listSubmissions,
  requireSubmission,
  reviewSubmission,
  toSubmissionView,
  type SubmissionDraft,
  type SubmissionReview,
} from "../../models/submissions";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignmentFixture,
  seedCreatorId,
  seedMembership,
  seedOneSubmission,
  seedSubmission,
  storedSubmission,
  storedSubmissions,
  withoutReviewerIdentity,
  type AssignmentFixture,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const draft = {
  draftUrl: "https://drive.example.com/drafts/driftwood-first-deploy",
  draftDescription: "60-second walkthrough: install, `driftwood init`, first deploy at 0:45.",
};

const firstPage = { numItems: 10, cursor: null as string | null };

async function submit(
  t: TestConvex,
  fixture: AssignmentFixture,
  overrides: Partial<SubmissionDraft> = {},
  creatorId: Id<"creators"> = fixture.creatorId,
) {
  return await t.run(
    async (ctx) =>
      await createSubmission(ctx, creatorId, {
        assignmentId: fixture.assignmentId,
        ...draft,
        ...overrides,
      }),
  );
}

async function expectReason(call: () => Promise<unknown>, code: ApiErrorCode, reason: string) {
  await expect(call()).rejects.toMatchObject({ data: { code, reason } });
}

async function reviewAs(
  t: TestConvex,
  membership: Doc<"companyUsers">,
  submissionId: Id<"submissions">,
  review: SubmissionReview,
) {
  return await t.run(async (ctx) => await reviewSubmission(ctx, membership, submissionId, review));
}

const creatorViewer = (fixture: AssignmentFixture): Viewer => ({
  role: "creator",
  creatorId: fixture.creatorId,
});
const companyViewer = (fixture: AssignmentFixture): Viewer => ({
  role: "company",
  companyId: fixture.membership.companyId,
});
const operatorViewer: Viewer = { role: "operator" };

async function getAs(t: TestConvex, viewer: Viewer, submissionId: Id<"submissions">) {
  return await t.run(async (ctx) => await requireSubmission(ctx, viewer, submissionId));
}

async function listAs(
  t: TestConvex,
  viewer: Viewer,
  assignmentId: Id<"assignments">,
  paginationOpts = firstPage,
) {
  return await t.run(
    async (ctx) => await listSubmissions(ctx, viewer, assignmentId, paginationOpts),
  );
}

async function expectedFull(t: TestConvex, submissionId: Id<"submissions">, closed = false) {
  const stored = await storedSubmission(t, submissionId);
  if (stored === null) throw new Error("expected a stored submission");
  return { ...stored, closedWithoutReview: closed };
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
        ...draft,
        status: "pending",
        usesAiReview,
      });
    },
  );

  test("trims the draft fields", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    const id = await submit(t, fixture, {
      draftUrl: `  ${draft.draftUrl}  `,
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

      await expectReason(() => submit(t, fixture), "invalid_state", "assignment_not_active");

      expect(await storedSubmissions(t)).toHaveLength(0);
    },
  );

  test("rejects a new draft while one is pending", async () => {
    const t = convexTest(schema, modules);
    const { fixture } = await seedOneSubmission(t);

    await expectReason(() => submit(t, fixture), "conflict", "submission_pending");

    expect(await storedSubmissions(t)).toHaveLength(1);
  });

  test("rejects a new draft once one is approved", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await seedSubmission(t, fixture, "changesRequested");
    await seedSubmission(t, fixture, "approved");

    await expectReason(() => submit(t, fixture), "invalid_state", "already_approved");

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

  test.each([
    ["draftUrl", "   "],
    ["draftDescription", " \n "],
  ] as const)("rejects a blank %s without writing a submission", async (field, value) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    await expectReason(
      () => submit(t, fixture, { [field]: value } as Partial<SubmissionDraft>),
      "invalid_state",
      `${field}_blank`,
    );

    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  // Everything before `@` is login details: `drive.google.com@evil.example` goes to evil.example.
  test.each([
    "not a url",
    "ftp://example.com/draft.mp4",
    "javascript:alert(1)",
    "https://drive.google.com@evil.example/draft",
    "https://user:pass@drive.example.com/draft",
  ])("rejects draft URL %s without writing a submission", async (draftUrl) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    await expectReason(() => submit(t, fixture, { draftUrl }), "invalid_state", "draftUrl_invalid");

    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  test.each([
    ["https://drive.example.com/a\nb", "https://drive.example.com/ab"],
    [
      'https://drive.example.com/"><img src=x>',
      "https://drive.example.com/%22%3E%3Cimg%20src=x%3E",
    ],
    ["HTTPS://Drive.Example.com/draft", "https://drive.example.com/draft"],
  ])("stores draft URL %j in its parsed form", async (draftUrl, stored) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    const id = await submit(t, fixture, { draftUrl });

    expect(await storedSubmission(t, id)).toMatchObject({ draftUrl: stored });
  });

  test("rejects a draft URL that goes over the length limit once encoded", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    // 726 characters as typed; each `"` becomes `%22`, making it 2,126.
    const draftUrl = `https://drive.example.com/${'"'.repeat(700)}`;

    await expectReason(
      () => submit(t, fixture, { draftUrl }),
      "invalid_state",
      "draftUrl_too_long",
    );

    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  test.each([
    ["draftUrl", `https://drive.example.com/${"a".repeat(2048)}`],
    ["draftDescription", "a".repeat(5001)],
  ] as const)("rejects a %s over the length limit", async (field, value) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    await expectReason(
      () => submit(t, fixture, { [field]: value } as Partial<SubmissionDraft>),
      "invalid_state",
      `${field}_too_long`,
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

    await expectReason(
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

      await expectReason(
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

      await expectReason(
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

      await expectReason(
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
      (await listAs(t, operatorViewer, fixture.assignmentId)).page[0],
      await getAs(t, creatorViewer(fixture), id),
      (await listAs(t, creatorViewer(fixture), fixture.assignmentId)).page[0],
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
    _id: "submissions|1" as Id<"submissions">,
    _creationTime: 1,
    assignmentId: "assignments|1" as Id<"assignments">,
    ...draft,
    usesAiReview: false,
  };
  const creator: Viewer = { role: "creator", creatorId: "creators|1" as Id<"creators"> };
  const company: Viewer = {
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

    const result = await listAs(t, companyViewer(fixture), fixture.assignmentId);

    expect(result.page.map((s) => s._id)).toEqual([secondId, firstId]);
    expect(result.isDone).toBe(true);
  });

  test("paginates with the returned cursor", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const firstId = await seedSubmission(t, fixture, "changesRequested");
    const secondId = await seedSubmission(t, fixture, "pending");

    const pageOne = await listAs(t, operatorViewer, fixture.assignmentId, {
      numItems: 1,
      cursor: null,
    });
    const pageTwo = await listAs(t, operatorViewer, fixture.assignmentId, {
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

    const result = await listAs(t, creatorViewer(fixture), fixture.assignmentId);

    expect(result.page).toEqual([
      withoutReviewerIdentity(await expectedFull(t, secondId)),
      withoutReviewerIdentity(await expectedFull(t, firstId)),
    ]);
  });

  test("returns an empty page for an assignment with no submissions", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);

    const result = await listAs(t, creatorViewer(fixture), fixture.assignmentId);

    expect(result.page).toEqual([]);
  });

  test("hides another creator's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const intruderId = await seedCreatorId(t, "ls-intruder");

    await expectApiError(
      () => listAs(t, { role: "creator", creatorId: intruderId }, fixture.assignmentId),
      "not_found",
    );
  });

  test("hides another company's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    const { membership: outsider } = await seedMembership(t, "ls-outsider");

    await expectApiError(
      () => listAs(t, { role: "company", companyId: outsider.companyId }, fixture.assignmentId),
      "not_found",
    );
  });

  test("rejects an assignment that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignmentFixture(t);
    await t.run(async (ctx) => await ctx.db.delete("assignments", fixture.assignmentId));

    await expectApiError(() => listAs(t, operatorViewer, fixture.assignmentId), "not_found");
  });
});
