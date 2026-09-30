/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ApiErrorCode } from "../../lib/errors";
import {
  createSubmission,
  listCreatorSubmissions,
  listSubmissions,
  requireCreatorSubmission,
  requireSubmission,
  reviewSubmission,
  toCreatorSubmission,
  type SubmissionDraft,
  type SubmissionReview,
  type SubmissionViewer,
} from "../../models/submissions";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignment,
  seedCreatorId,
  seedMembership,
  seedOneSubmission,
  seedSubmission,
  storedSubmission,
  storedSubmissions,
  type AssignmentFixture,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const draft = {
  draftUrl: "https://drive.example.com/drafts/driftwood-first-deploy",
  draftDescription: "60-second walkthrough: install, `driftwood init`, first deploy at 0:45.",
};

const firstPage = { numItems: 10, cursor: null as string | null };

/** Submits `draft` as the fixture's creator, with any fields overridden. */
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

/** Reviews a submission as the given company member. */
async function reviewAs(
  t: TestConvex,
  membership: Doc<"companyUsers">,
  submissionId: Id<"submissions">,
  review: SubmissionReview,
) {
  return await t.run(async (ctx) => await reviewSubmission(ctx, membership, submissionId, review));
}

/** Narrows to a reviewed submission so its review fields can be read. */
function reviewedAtOf(submission: Doc<"submissions">): number {
  if (submission.status === "pending") throw new Error("expected a reviewed submission");
  return submission.reviewedAt;
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

// Fields that identify reviewers or disputes; creators must never receive them.
const hiddenFromCreators = ["reviewedBy", "reviewedByOperator", "overriddenReview", "disputeId"];

function expectCreatorShape(view: object) {
  for (const field of hiddenFromCreators) expect(view).not.toHaveProperty(field);
}

async function getAs(t: TestConvex, viewer: SubmissionViewer, submissionId: Id<"submissions">) {
  return await t.run(async (ctx) => await requireSubmission(ctx, viewer, submissionId));
}

async function listAs(
  t: TestConvex,
  viewer: SubmissionViewer,
  assignmentId: Id<"assignments">,
  paginationOpts = firstPage,
) {
  return await t.run(
    async (ctx) => await listSubmissions(ctx, viewer, assignmentId, paginationOpts),
  );
}

async function getMineAs(
  t: TestConvex,
  creatorId: Id<"creators">,
  submissionId: Id<"submissions">,
) {
  return await t.run(async (ctx) => await requireCreatorSubmission(ctx, creatorId, submissionId));
}

async function listMineAs(
  t: TestConvex,
  creatorId: Id<"creators">,
  assignmentId: Id<"assignments">,
) {
  return await t.run(
    async (ctx) => await listCreatorSubmissions(ctx, creatorId, assignmentId, firstPage),
  );
}

describe("createSubmission", () => {
  test.each([true, false])(
    "stores a pending draft and copies usesAiReview=%s from the assignment",
    async (usesAiReview) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignment(t, `cs-ai-${usesAiReview}`, { usesAiReview });

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
    const fixture = await seedAssignment(t, "cs-trim");

    const id = await submit(t, fixture, {
      draftUrl: `  ${draft.draftUrl}  `,
      draftDescription: `  ${draft.draftDescription}\n`,
    });

    expect(await storedSubmission(t, id)).toMatchObject(draft);
  });

  test("rejects another creator's assignment without writing a submission", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "cs-owner");
    const intruderId = await seedCreatorId(t, "cs-intruder");

    await expectApiError(() => submit(t, fixture, {}, intruderId), "not_found");

    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  test("rejects an assignment that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "cs-gone");
    await t.run(async (ctx) => await ctx.db.delete("assignments", fixture.assignmentId));

    await expectApiError(() => submit(t, fixture), "not_found");
  });

  test.each(["termsPending", "completed", "cancelled"] as const)(
    "rejects a %s assignment without writing a submission",
    async (status) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignment(t, `cs-status-${status}`, { status });

      await expectReason(() => submit(t, fixture), "invalid_state", "assignment_not_active");

      expect(await storedSubmissions(t)).toHaveLength(0);
    },
  );

  test("rejects a new draft while one is pending", async () => {
    const t = convexTest(schema, modules);
    const { fixture } = await seedOneSubmission(t, "cs-pending");

    await expectReason(() => submit(t, fixture), "conflict", "submission_pending");

    expect(await storedSubmissions(t)).toHaveLength(1);
  });

  test("rejects a new draft once one is approved", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "cs-approved");
    await seedSubmission(t, fixture, "changesRequested");
    await seedSubmission(t, fixture, "approved");

    await expectReason(() => submit(t, fixture), "invalid_state", "already_approved");

    expect(await storedSubmissions(t)).toHaveLength(2);
  });

  test("accepts a resubmission after changes are requested", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: firstId } = await seedOneSubmission(
      t,
      "cs-resubmit",
      "changesRequested",
    );

    const secondId = await submit(t, fixture);
    const stored = await storedSubmissions(t);

    // The earlier draft is untouched; the resubmission is a new row.
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
    const fixture = await seedAssignment(t, `cs-blank-${field}`);

    await expectReason(
      () => submit(t, fixture, { [field]: value } as Partial<SubmissionDraft>),
      "invalid_state",
      `${field}_blank`,
    );

    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  test.each(["not a url", "ftp://example.com/draft.mp4", "javascript:alert(1)"])(
    "rejects non-http(s) draft URL %s",
    async (draftUrl) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignment(t, "cs-url");

      await expectReason(
        () => submit(t, fixture, { draftUrl }),
        "invalid_state",
        "draftUrl_invalid",
      );
    },
  );

  test.each([
    ["draftUrl", `https://drive.example.com/${"a".repeat(2048)}`],
    ["draftDescription", "a".repeat(5001)],
  ] as const)("rejects a %s over the length limit", async (field, value) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, `cs-long-${field}`);

    await expectReason(
      () => submit(t, fixture, { [field]: value } as Partial<SubmissionDraft>),
      "invalid_state",
      `${field}_too_long`,
    );

    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  test("accepts a description exactly at the limit, measured after trimming", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "cs-long-edge");
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
    const { fixture, submissionId: id } = await seedOneSubmission(t, "rs-approve");

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
    expect(reviewedAtOf(reviewed)).toBeGreaterThanOrEqual(before);
    expect(reviewedAtOf(reviewed)).toBeLessThanOrEqual(after);
    // The returned row is what was stored.
    expect(await storedSubmission(t, id)).toEqual(reviewed);
  });

  test("stores a trimmed note on an approval", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t, "rs-approve-note");

    const reviewed = await reviewAs(t, fixture.membership, id, {
      status: "approved",
      reviewNote: "  Clear terminal font and a clean first deploy.  ",
    });

    expect(reviewed.reviewNote).toBe("Clear terminal font and a clean first deploy.");
  });

  test("requests changes with a note", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t, "rs-changes");

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

  test("rejects a blank note without reviewing", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t, "rs-blank");

    await expectReason(
      () => reviewAs(t, fixture.membership, id, { status: "changesRequested", reviewNote: "  \n" }),
      "invalid_state",
      "reviewNote_blank",
    );

    expect(await storedSubmission(t, id)).toMatchObject({ status: "pending" });
  });

  test("rejects a note over the length limit without reviewing", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t, "rs-long");

    await expectReason(
      () =>
        reviewAs(t, fixture.membership, id, {
          status: "changesRequested",
          reviewNote: "a".repeat(2001),
        }),
      "invalid_state",
      "reviewNote_too_long",
    );

    expect(await storedSubmission(t, id)).toMatchObject({ status: "pending" });
  });

  test("accepts a note exactly at the limit", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t, "rs-long-edge");

    const reviewed = await reviewAs(t, fixture.membership, id, {
      status: "changesRequested",
      reviewNote: "a".repeat(2000),
    });

    expect(reviewed.reviewNote).toHaveLength(2000);
  });

  test("rejects a member of another company without reviewing", async () => {
    const t = convexTest(schema, modules);
    const { submissionId: id } = await seedOneSubmission(t, "rs-owner");
    const { membership: outsider } = await seedMembership(t, "rs-outsider");

    await expectApiError(() => reviewAs(t, outsider, id, { status: "approved" }), "not_found");

    expect(await storedSubmission(t, id)).toMatchObject({ status: "pending" });
  });

  test("rejects a submission that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t, "rs-gone");
    await t.run(async (ctx) => await ctx.db.delete("submissions", id));

    await expectApiError(
      () => reviewAs(t, fixture.membership, id, { status: "approved" }),
      "not_found",
    );
  });

  // Reviews are final: only a pending submission can be reviewed.
  test.each(["approved", "changesRequested"] as const)(
    "rejects a submission already %s without changing it",
    async (status) => {
      const t = convexTest(schema, modules);
      const { fixture, submissionId: id } = await seedOneSubmission(
        t,
        `rs-final-${status}`,
        status,
      );
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
      const { fixture, submissionId: id } = await seedOneSubmission(
        t,
        `rs-assignment-${status}`,
        "pending",
        { status },
      );

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
    const { fixture, submissionId: id } = await seedOneSubmission(t, "rs-ai", "pending", {
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

describe("toCreatorSubmission", () => {
  // Built directly: this is a pure function, so no database is needed.
  const base = {
    _id: "submissions|1" as Id<"submissions">,
    _creationTime: 1,
    assignmentId: "assignments|1" as Id<"assignments">,
    ...draft,
    usesAiReview: false,
  };

  test("returns a pending draft unchanged", () => {
    const pending: Doc<"submissions"> = { ...base, status: "pending" };

    expect(toCreatorSubmission(pending)).toEqual(pending);
  });

  test("keeps a company review's outcome but hides the reviewer", () => {
    const reviewed: Doc<"submissions"> = {
      ...base,
      status: "changesRequested",
      reviewNote: "Add #ad to the caption before posting.",
      reviewerType: "companyUser",
      reviewedBy: "companyUsers|1" as Id<"companyUsers">,
      reviewedAt: 2,
    };

    expect(toCreatorSubmission(reviewed)).toEqual({
      ...base,
      status: "changesRequested",
      reviewNote: "Add #ad to the caption before posting.",
      reviewerType: "companyUser",
      reviewedAt: 2,
    });
  });

  test("hides the operator, the overridden review, and the dispute", () => {
    const overridden: Doc<"submissions"> = {
      ...base,
      status: "changesRequested",
      reviewNote: "Caption promises 99.99% uptime, which is a prohibited claim.",
      reviewerType: "operator",
      reviewedByOperator: "users|1" as Id<"users">,
      reviewedAt: 3,
      overriddenReview: { status: "approved", reviewerType: "ai", reviewedAt: 2 },
      disputeId: "disputes|1" as Id<"disputes">,
    };

    expect(toCreatorSubmission(overridden)).toEqual({
      ...base,
      status: "changesRequested",
      reviewNote: "Caption promises 99.99% uptime, which is a prohibited claim.",
      reviewerType: "operator",
      reviewedAt: 3,
    });
  });
});

describe("requireSubmission", () => {
  test("lets a creator access their own submission", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(
      t,
      "gs-creator",
      "changesRequested",
    );

    expect(await getAs(t, creatorViewer(fixture), id)).toEqual(await storedSubmission(t, id));
  });

  test("gives the company its submission with reviewer details", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t, "gs-company", "approved");

    const view = await getAs(t, companyViewer(fixture), id);

    expect(view).toEqual(await storedSubmission(t, id));
    expect(view).toHaveProperty("reviewedBy", fixture.membership._id);
  });

  test("gives an operator any submission in full", async () => {
    const t = convexTest(schema, modules);
    const { submissionId: id } = await seedOneSubmission(t, "gs-operator", "approved");

    expect(await getAs(t, operatorViewer, id)).toEqual(await storedSubmission(t, id));
  });

  test("hides another creator's submission", async () => {
    const t = convexTest(schema, modules);
    const { submissionId: id } = await seedOneSubmission(t, "gs-owner");
    const intruderId = await seedCreatorId(t, "gs-intruder");

    await expectApiError(
      () => getAs(t, { role: "creator", creatorId: intruderId }, id),
      "not_found",
    );
  });

  test("hides another company's submission", async () => {
    const t = convexTest(schema, modules);
    const { submissionId: id } = await seedOneSubmission(t, "gs-owner-co");
    const { membership: outsider } = await seedMembership(t, "gs-outsider");

    await expectApiError(
      () => getAs(t, { role: "company", companyId: outsider.companyId }, id),
      "not_found",
    );
  });

  test("rejects a submission that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const { submissionId: id } = await seedOneSubmission(t, "gs-gone");
    await t.run(async (ctx) => await ctx.db.delete("submissions", id));

    await expectApiError(() => getAs(t, operatorViewer, id), "not_found");
  });
});

describe("listSubmissions", () => {
  test("lists an assignment's submissions newest first", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "ls-order");
    const firstId = await seedSubmission(t, fixture, "changesRequested");
    const secondId = await seedSubmission(t, fixture, "pending");

    const result = await listAs(t, companyViewer(fixture), fixture.assignmentId);

    expect(result.page.map((s) => s._id)).toEqual([secondId, firstId]);
    expect(result.isDone).toBe(true);
  });

  test("paginates with the returned cursor", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "ls-pages");
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

  test("returns an empty page for an assignment with no submissions", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "ls-empty");

    const result = await listAs(t, creatorViewer(fixture), fixture.assignmentId);

    expect(result.page).toEqual([]);
  });

  test("hides another creator's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "ls-owner");
    const intruderId = await seedCreatorId(t, "ls-intruder");

    await expectApiError(
      () => listAs(t, { role: "creator", creatorId: intruderId }, fixture.assignmentId),
      "not_found",
    );
  });

  test("hides another company's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "ls-owner-co");
    const { membership: outsider } = await seedMembership(t, "ls-outsider");

    await expectApiError(
      () => listAs(t, { role: "company", companyId: outsider.companyId }, fixture.assignmentId),
      "not_found",
    );
  });

  test("rejects an assignment that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "ls-gone");
    await t.run(async (ctx) => await ctx.db.delete("assignments", fixture.assignmentId));

    await expectApiError(() => listAs(t, operatorViewer, fixture.assignmentId), "not_found");
  });
});

describe("requireCreatorSubmission", () => {
  test("returns the creator's own submission in the creator shape", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId: id } = await seedOneSubmission(t, "gm-own", "approved");
    const stored = await storedSubmission(t, id);

    const view = await getMineAs(t, fixture.creatorId, id);

    expect(view).toEqual(toCreatorSubmission(stored!));
    expectCreatorShape(view);
  });

  test("hides another creator's submission", async () => {
    const t = convexTest(schema, modules);
    const { submissionId: id } = await seedOneSubmission(t, "gm-owner");
    const intruderId = await seedCreatorId(t, "gm-intruder");

    await expectApiError(() => getMineAs(t, intruderId, id), "not_found");
  });
});

describe("listCreatorSubmissions", () => {
  test("lists the creator's submissions newest first in the creator shape", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "lm-own");
    const firstId = await seedSubmission(t, fixture, "changesRequested");
    const secondId = await seedSubmission(t, fixture, "approved");

    const result = await listMineAs(t, fixture.creatorId, fixture.assignmentId);

    expect(result.page).toEqual([
      toCreatorSubmission((await storedSubmission(t, secondId))!),
      toCreatorSubmission((await storedSubmission(t, firstId))!),
    ]);
  });

  test("hides another creator's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "lm-owner");
    const intruderId = await seedCreatorId(t, "lm-intruder");

    await expectApiError(() => listMineAs(t, intruderId, fixture.assignmentId), "not_found");
  });
});
