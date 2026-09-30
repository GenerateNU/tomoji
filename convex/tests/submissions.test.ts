/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { ApiErrorCode } from "../lib/errors";
import { toCreatorSubmission } from "../models/submissions";
import schema from "../schema";
import {
  expectApiError,
  seedAssignment,
  seedMembership,
  seedOperator,
  seedSubmission,
  seedUser,
  seedWrongOrgCaller,
  type AssignmentFixture,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const draft = {
  draftUrl: "https://drive.example.com/drafts/1",
  draftDescription: "30-second unboxing, product shown at 0:03.",
};

type CreateArgs = FunctionArgs<typeof api.submissions.create>;
type ReviewArgs = FunctionArgs<typeof api.submissions.review>;

function createArgs(fixture: AssignmentFixture): CreateArgs {
  return { assignmentId: fixture.assignmentId, ...draft };
}

async function storedSubmissions(t: TestConvex) {
  return await t.run(async (ctx) => await ctx.db.query("submissions").collect());
}

async function storedSubmission(
  t: TestConvex,
  submissionId: Id<"submissions">,
): Promise<Doc<"submissions"> | null> {
  // `TestConvex` loses the schema types, so the row comes back untyped.
  return (await t.run(
    async (ctx) => await ctx.db.get("submissions", submissionId),
  )) as Doc<"submissions"> | null;
}

/** Seeds an assignment with one pending draft, ready for review. */
async function seedPendingSubmission(t: TestConvex, prefix: string) {
  const fixture = await seedAssignment(t, prefix);
  const submissionId = await seedSubmission(t, fixture, "pending");
  return { fixture, submissionId };
}

type Client = Pick<TestConvex, "mutation" | "query">;
type Caller = (t: TestConvex, fixture: AssignmentFixture) => Promise<Client>;

// Callers refused by the creator-only routes (`create`, `getMine`, `listMine`).
const nonCreators: [string, Caller, ApiErrorCode][] = [
  ["a signed-out caller", async (t) => t, "not_authenticated"],
  ["a company user", async (_t, fixture) => fixture.asCompany, "forbidden"],
  ["an operator", async (t) => await seedOperator(t, "sc-operator-user"), "forbidden"],
];

// Only company users may review drafts; every other caller is refused by the builder.
const nonCompanyUsers: [string, Caller, ApiErrorCode][] = [
  ["a signed-out caller", async (t) => t, "not_authenticated"],
  ["a creator", async (_t, fixture) => fixture.asCreator, "forbidden"],
  ["an operator", async (t) => await seedOperator(t, "sr-operator-user"), "forbidden"],
];

// Company users and operators read full rows through `get` and `list`.
const fullReaders: [string, Caller][] = [
  ["the company user", async (_t, fixture) => fixture.asCompany],
  ["an operator", async (t) => await seedOperator(t, "sr-reader-operator")],
];

// Callers `get` and `list` refuse before any submission is read. Creators use
// `getMine` and `listMine` instead.
const nonFullReaders: [string, Caller, ApiErrorCode][] = [
  ["a signed-out caller", async (t) => t, "not_authenticated"],
  ["a creator", async (_t, fixture) => fixture.asCreator, "forbidden"],
  [
    "a company user acting on an org they don't belong to",
    async (t) => await seedWrongOrgCaller(t),
    "forbidden",
  ],
];

const firstPage = { numItems: 10, cursor: null };

/** Returns a submission in the creator shape, as a creator route should. */
async function creatorView(t: TestConvex, submissionId: Id<"submissions">) {
  const stored = await storedSubmission(t, submissionId);
  if (stored === null) throw new Error("expected a stored submission");
  return toCreatorSubmission(stored);
}

describe("submissions.create", () => {
  test("submits a pending draft on the caller's own assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "sc-own", { usesAiReview: true });

    const id = await fixture.asCreator.mutation(api.submissions.create, createArgs(fixture));
    const stored = await t.run(async (ctx) => await ctx.db.get("submissions", id));

    expect(stored).toMatchObject({
      ...createArgs(fixture),
      status: "pending",
      usesAiReview: true,
    });
  });

  // The arg validator only accepts the draft fields, so a client cannot set the
  // server-owned fields. This pins that nobody widens it later.
  test.each([
    ["status", "approved"],
    ["usesAiReview", true],
  ] as const)("rejects a client-supplied %s", async (field, value) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, `sc-extra-${field}`);

    await expect(
      fixture.asCreator.mutation(api.submissions.create, {
        ...createArgs(fixture),
        [field]: value,
        // Bypasses the compile-time check to exercise the runtime validator,
        // which is what a malicious client would hit.
      } as never),
    ).rejects.toThrow(`Unexpected field \`${field}\``);

    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  test("rejects another creator's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "sc-owner");
    const asIntruder = await seedUser(t, { subject: "sc-intruder" });

    await expectApiError(
      () => asIntruder.mutation(api.submissions.create, createArgs(fixture)),
      "not_found",
    );

    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  test.each(nonCreators)(
    "rejects %s without writing a submission",
    async (_label, caller, code) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignment(t, "sc-caller");
      const client = await caller(t, fixture);

      await expectApiError(
        () => client.mutation(api.submissions.create, createArgs(fixture)),
        code,
      );

      expect(await storedSubmissions(t)).toHaveLength(0);
    },
  );
});

describe("submissions.review", () => {
  test("records the review as the calling company user", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedPendingSubmission(t, "sr-approve");

    const reviewed = await fixture.asCompany.mutation(api.submissions.review, {
      submissionId,
      review: { status: "approved" },
    });

    // The reviewer comes from the caller's membership, never from the client.
    expect(reviewed).toMatchObject({
      _id: submissionId,
      status: "approved",
      reviewerType: "companyUser",
      reviewedBy: fixture.membership._id,
    });
    expect(await storedSubmission(t, submissionId)).toEqual(reviewed);
  });

  test("requests changes with a note", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedPendingSubmission(t, "sr-changes");

    const reviewed = await fixture.asCompany.mutation(api.submissions.review, {
      submissionId,
      review: { status: "changesRequested", reviewNote: "Add the #ad disclosure." },
    });

    expect(reviewed).toMatchObject({
      status: "changesRequested",
      reviewNote: "Add the #ad disclosure.",
    });
  });

  // The union validator makes the note required for a change request, so the
  // handler never runs without one.
  test("rejects a change request with no note", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedPendingSubmission(t, "sr-no-note");

    await expect(
      fixture.asCompany.mutation(api.submissions.review, {
        submissionId,
        // Bypasses the compile-time check to exercise the runtime validator.
        review: { status: "changesRequested" },
      } as never),
    ).rejects.toThrow("Validator error: Expected one of");

    expect(await storedSubmission(t, submissionId)).toMatchObject({ status: "pending" });
  });

  // The reviewer fields are server-owned; the arg validator must not accept them.
  test.each([
    ["reviewedBy", "companyUsers|fake"],
    ["reviewerType", "ai"],
  ] as const)("rejects a client-supplied %s", async (field, value) => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedPendingSubmission(t, `sr-extra-${field}`);

    await expect(
      fixture.asCompany.mutation(api.submissions.review, {
        submissionId,
        review: { status: "approved" },
        [field]: value,
        // Bypasses the compile-time check to exercise the runtime validator.
      } as never),
    ).rejects.toThrow(`Unexpected field \`${field}\``);

    expect(await storedSubmission(t, submissionId)).toMatchObject({ status: "pending" });
  });

  test("rejects a member of another company", async () => {
    const t = convexTest(schema, modules);
    const { submissionId } = await seedPendingSubmission(t, "sr-owner");
    const { asMember: asOutsider } = await seedMembership(t, "sr-outsider");

    await expectApiError(
      () =>
        asOutsider.mutation(api.submissions.review, {
          submissionId,
          review: { status: "approved" },
        } satisfies ReviewArgs),
      "not_found",
    );

    expect(await storedSubmission(t, submissionId)).toMatchObject({ status: "pending" });
  });

  test.each(nonCompanyUsers)("rejects %s without reviewing", async (_label, caller, code) => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedPendingSubmission(t, "sr-caller");
    const client = await caller(t, fixture);

    await expectApiError(
      () =>
        client.mutation(api.submissions.review, {
          submissionId,
          review: { status: "approved" },
        }),
      code,
    );

    expect(await storedSubmission(t, submissionId)).toMatchObject({ status: "pending" });
  });
});

describe("submissions.get", () => {
  test.each(fullReaders)("gives %s the submission as stored", async (_label, caller) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "sg-reader");
    const submissionId = await seedSubmission(t, fixture, "approved");
    const client = await caller(t, fixture);

    const view = await client.query(api.submissions.get, { submissionId });

    expect(view).toEqual(await storedSubmission(t, submissionId));
  });

  // `not_found`, so another company can't tell it apart from a missing submission.
  test("hides the submission from another company's user", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "sg-owner");
    const submissionId = await seedSubmission(t, fixture, "pending");
    const { asMember: asOutsider } = await seedMembership(t, "sg-outsider");

    await expectApiError(
      () => asOutsider.query(api.submissions.get, { submissionId }),
      "not_found",
    );
  });

  test.each(nonFullReaders)("rejects %s", async (_label, caller, code) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "sg-refused");
    const submissionId = await seedSubmission(t, fixture, "pending");
    const client = await caller(t, fixture);

    await expectApiError(() => client.query(api.submissions.get, { submissionId }), code);
  });
});

describe("submissions.list", () => {
  test.each(fullReaders)(
    "gives %s every submission, newest first, as stored",
    async (_label, caller) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignment(t, "sl-reader");
      const firstId = await seedSubmission(t, fixture, "changesRequested");
      const secondId = await seedSubmission(t, fixture, "approved");
      const client = await caller(t, fixture);

      const result = await client.query(api.submissions.list, {
        assignmentId: fixture.assignmentId,
        paginationOpts: firstPage,
      });

      expect(result.page).toEqual([
        await storedSubmission(t, secondId),
        await storedSubmission(t, firstId),
      ]);
    },
  );

  test("hides the assignment from another company's user", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "sl-owner");
    await seedSubmission(t, fixture, "pending");
    const { asMember: asOutsider } = await seedMembership(t, "sl-outsider");

    await expectApiError(
      () =>
        asOutsider.query(api.submissions.list, {
          assignmentId: fixture.assignmentId,
          paginationOpts: firstPage,
        }),
      "not_found",
    );
  });

  test.each(nonFullReaders)("rejects %s", async (_label, caller, code) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "sl-refused");
    const client = await caller(t, fixture);

    await expectApiError(
      () =>
        client.query(api.submissions.list, {
          assignmentId: fixture.assignmentId,
          paginationOpts: firstPage,
        }),
      code,
    );
  });
});

describe("submissions.getMine", () => {
  // Exact equality: the route's `returns` validator rejects any extra field, so
  // reviewer and dispute details can never reach a creator.
  test("gives the creator their submission in the creator shape", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "sm-own");
    const submissionId = await seedSubmission(t, fixture, "approved");

    const view = await fixture.asCreator.query(api.submissions.getMine, { submissionId });

    expect(view).toEqual(await creatorView(t, submissionId));
    expect(view).not.toHaveProperty("reviewedBy");
  });

  test("hides another creator's submission", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "sm-owner");
    const submissionId = await seedSubmission(t, fixture, "pending");
    const asIntruder = await seedUser(t, { subject: "sm-intruder" });

    await expectApiError(
      () => asIntruder.query(api.submissions.getMine, { submissionId }),
      "not_found",
    );
  });

  test.each(nonCreators)("rejects %s", async (_label, caller, code) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "sm-refused");
    const submissionId = await seedSubmission(t, fixture, "pending");
    const client = await caller(t, fixture);

    await expectApiError(() => client.query(api.submissions.getMine, { submissionId }), code);
  });
});

describe("submissions.listMine", () => {
  test("gives the creator every submission, newest first, in the creator shape", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "slm-own");
    const firstId = await seedSubmission(t, fixture, "changesRequested");
    const secondId = await seedSubmission(t, fixture, "approved");

    const result = await fixture.asCreator.query(api.submissions.listMine, {
      assignmentId: fixture.assignmentId,
      paginationOpts: firstPage,
    });

    expect(result.page).toEqual([await creatorView(t, secondId), await creatorView(t, firstId)]);
  });

  test("hides another creator's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "slm-owner");
    const asIntruder = await seedUser(t, { subject: "slm-intruder" });

    await expectApiError(
      () =>
        asIntruder.query(api.submissions.listMine, {
          assignmentId: fixture.assignmentId,
          paginationOpts: firstPage,
        }),
      "not_found",
    );
  });

  test.each(nonCreators)("rejects %s", async (_label, caller, code) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, "slm-refused");
    const client = await caller(t, fixture);

    await expectApiError(
      () =>
        client.query(api.submissions.listMine, {
          assignmentId: fixture.assignmentId,
          paginationOpts: firstPage,
        }),
      code,
    );
  });
});
