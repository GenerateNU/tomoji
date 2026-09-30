/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Doc, Id } from "../../_generated/dataModel";
import type { ApiErrorCode } from "../../lib/errors";
import {
  createSubmission,
  reviewSubmission,
  type SubmissionDraft,
  type SubmissionReview,
} from "../../models/submissions";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignment,
  seedCreatorId,
  seedMembership,
  seedSubmission,
  type AssignmentFixture,
  type TestConvex,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

const draft = {
  draftUrl: "https://drive.example.com/drafts/1",
  draftDescription: "30-second unboxing, product shown at 0:03.",
};

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

// Each test has its own database with a single assignment, so every stored
// submission belongs to that assignment.
async function storedSubmissions(t: TestConvex) {
  return await t.run(async (ctx) => await ctx.db.query("submissions").collect());
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

async function storedSubmission(t: TestConvex, submissionId: Id<"submissions">) {
  return await t.run(async (ctx) => await ctx.db.get("submissions", submissionId));
}

/** Narrows to a reviewed submission so its review fields can be read. */
function reviewedAtOf(submission: Doc<"submissions">): number {
  if (submission.status === "pending") throw new Error("expected a reviewed submission");
  return submission.reviewedAt;
}

describe("createSubmission", () => {
  test.each([true, false])(
    "stores a pending draft and copies usesAiReview=%s from the assignment",
    async (usesAiReview) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignment(t, `cs-ai-${usesAiReview}`, {
        usesAiReview,
      });

      const id = await submit(t, fixture);
      const stored = await t.run(async (ctx) => await ctx.db.get("submissions", id));

      expect(stored).toMatchObject({
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
    const stored = await t.run(async (ctx) => await ctx.db.get("submissions", id));

    expect(stored).toMatchObject(draft);
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
      const fixture = await seedAssignment(t, `cs-status-${status}`, {
        status,
      });

      await expectReason(() => submit(t, fixture), "invalid_state", "assignment_not_active");

      expect(await storedSubmissions(t)).toHaveLength(0);
    },
  );

  test("rejects a new draft while one is pending", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "cs-pending");
    await seedSubmission(t, fixture, "pending");

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
    const fixture = await seedAssignment(t, "cs-resubmit");
    const firstId = await seedSubmission(t, fixture, "changesRequested");

    const secondId = await submit(t, fixture);
    const stored = await storedSubmissions(t);

    // The earlier draft is untouched; the resubmission is a new row.
    expect(stored.map((s) => [s._id, s.status])).toEqual([
      [firstId, "changesRequested"],
      [secondId, "pending"],
    ]);
  });

  test.each([{ draftUrl: "   " }, { draftDescription: " \n " }])(
    "rejects blank draft fields %j without writing a submission",
    async (blank) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignment(t, "cs-blank");

      await expectApiError(() => submit(t, fixture, blank), "invalid_state");

      expect(await storedSubmissions(t)).toHaveLength(0);
    },
  );

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

  // TODO(dueAt): implement once assignments have a dueAt field.
  test.todo("rejects drafts and resubmissions after assignment.dueAt");
});

describe("reviewSubmission", () => {
  test("approves a pending draft and attributes the review to the caller", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "rs-approve");
    const id = await seedSubmission(t, fixture, "pending");

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
    const fixture = await seedAssignment(t, "rs-approve-note");
    const id = await seedSubmission(t, fixture, "pending");

    const reviewed = await reviewAs(t, fixture.membership, id, {
      status: "approved",
      reviewNote: "  Great hook in the first second.  ",
    });

    expect(reviewed.reviewNote).toBe("Great hook in the first second.");
  });

  test("requests changes with a note", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "rs-changes");
    const id = await seedSubmission(t, fixture, "pending");

    const reviewed = await reviewAs(t, fixture.membership, id, {
      status: "changesRequested",
      reviewNote: "Add the #ad disclosure in the caption.",
    });

    expect(reviewed).toMatchObject({
      status: "changesRequested",
      reviewNote: "Add the #ad disclosure in the caption.",
      reviewerType: "companyUser",
      reviewedBy: fixture.membership._id,
    });
  });

  test("rejects a blank note without reviewing", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "rs-blank");
    const id = await seedSubmission(t, fixture, "pending");

    await expectReason(
      () => reviewAs(t, fixture.membership, id, { status: "changesRequested", reviewNote: "  \n" }),
      "invalid_state",
      "reviewNote_blank",
    );

    expect(await storedSubmission(t, id)).toMatchObject({ status: "pending" });
  });

  test("rejects a member of another company without reviewing", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "rs-owner");
    const id = await seedSubmission(t, fixture, "pending");
    const { membership: outsider } = await seedMembership(t, "rs-outsider");

    await expectApiError(() => reviewAs(t, outsider, id, { status: "approved" }), "not_found");

    expect(await storedSubmission(t, id)).toMatchObject({ status: "pending" });
  });

  test("rejects a submission that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "rs-gone");
    const id = await seedSubmission(t, fixture, "pending");
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
      const fixture = await seedAssignment(t, `rs-final-${status}`);
      const id = await seedSubmission(t, fixture, status);
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
      const fixture = await seedAssignment(t, `rs-assignment-${status}`, { status });
      const id = await seedSubmission(t, fixture, "pending");

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
    const fixture = await seedAssignment(t, "rs-ai", { usesAiReview: true });
    const id = await seedSubmission(t, fixture, "pending");

    const reviewed = await reviewAs(t, fixture.membership, id, { status: "approved" });

    expect(reviewed).toMatchObject({
      usesAiReview: true,
      status: "approved",
      reviewerType: "companyUser",
    });
  });
});
