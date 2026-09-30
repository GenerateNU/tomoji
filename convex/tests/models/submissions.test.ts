/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import type { Id } from "../../_generated/dataModel";
import type { ApiErrorCode } from "../../lib/errors";
import {
  createSubmission,
  type SubmissionDraft,
} from "../../models/submissions";
import schema from "../../schema";
import {
  expectApiError,
  seedAssignment,
  seedCreatorId,
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

async function storedSubmissions(
  t: TestConvex,
  assignmentId: Id<"assignments">,
) {
  return await t.run(
    async (ctx) =>
      await ctx.db
        .query("submissions")
        .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignmentId))
        .collect(),
  );
}

async function expectReason(
  call: () => Promise<unknown>,
  code: ApiErrorCode,
  reason: string,
) {
  await expect(call()).rejects.toMatchObject({ data: { code, reason } });
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
      const stored = await t.run(
        async (ctx) => await ctx.db.get("submissions", id),
      );

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
    const stored = await t.run(
      async (ctx) => await ctx.db.get("submissions", id),
    );

    expect(stored).toMatchObject(draft);
  });

  test("rejects another creator's assignment without writing a submission", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "cs-owner");
    const intruderId = await seedCreatorId(t, "cs-intruder");

    await expectApiError(() => submit(t, fixture, {}, intruderId), "not_found");

    expect(await storedSubmissions(t, fixture.assignmentId)).toHaveLength(0);
  });

  test("rejects an assignment that no longer exists", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "cs-gone");
    await t.run(
      async (ctx) => await ctx.db.delete("assignments", fixture.assignmentId),
    );

    await expectApiError(() => submit(t, fixture), "not_found");
  });

  test.each(["termsPending", "completed", "cancelled"] as const)(
    "rejects a %s assignment without writing a submission",
    async (status) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignment(t, `cs-status-${status}`, {
        status,
      });

      await expectReason(
        () => submit(t, fixture),
        "invalid_state",
        "assignment_not_active",
      );

      expect(await storedSubmissions(t, fixture.assignmentId)).toHaveLength(0);
    },
  );

  test("rejects a new draft while one is pending", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "cs-pending");
    await seedSubmission(t, fixture, "pending");

    await expectReason(
      () => submit(t, fixture),
      "conflict",
      "submission_pending",
    );

    expect(await storedSubmissions(t, fixture.assignmentId)).toHaveLength(1);
  });

  test("rejects a new draft once one is approved", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "cs-approved");
    await seedSubmission(t, fixture, "changesRequested");
    await seedSubmission(t, fixture, "approved");

    await expectReason(
      () => submit(t, fixture),
      "invalid_state",
      "already_approved",
    );

    expect(await storedSubmissions(t, fixture.assignmentId)).toHaveLength(2);
  });

  test("accepts a resubmission after changes are requested", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "cs-resubmit");
    const firstId = await seedSubmission(t, fixture, "changesRequested");

    const secondId = await submit(t, fixture);
    const stored = await storedSubmissions(t, fixture.assignmentId);

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

      expect(await storedSubmissions(t, fixture.assignmentId)).toHaveLength(0);
    },
  );

  test.each([
    "not a url",
    "ftp://example.com/draft.mp4",
    "javascript:alert(1)",
  ])("rejects non-http(s) draft URL %s", async (draftUrl) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "cs-url");

    await expectReason(
      () => submit(t, fixture, { draftUrl }),
      "invalid_state",
      "draftUrl_invalid",
    );
  });

  // TODO(dueAt): implement once assignments have a dueAt field.
  test.todo("rejects drafts and resubmissions after assignment.dueAt");
});
