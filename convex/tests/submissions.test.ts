/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionArgs } from "convex/server";
import { describe, expect, test } from "vitest";
import { api } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ApiErrorCode } from "../lib/errors";
import schema from "../schema";
import {
  expectApiError,
  seedAssignment,
  seedMembership,
  seedOneSubmission,
  seedOperator,
  seedOverriddenSubmission,
  seedSubmission,
  seedUser,
  seedWrongOrgCaller,
  storedSubmission,
  storedSubmissions,
  withoutReviewerIdentity,
  type AssignmentFixture,
  type TestConvex,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

const draft = {
  draftUrl: "https://drive.example.com/drafts/driftwood-first-deploy",
  draftDescription: "60-second walkthrough: install, `driftwood init`, first deploy at 0:45.",
};

type CreateArgs = FunctionArgs<typeof api.submissions.create>;

function createArgs(fixture: AssignmentFixture): CreateArgs {
  return { assignmentId: fixture.assignmentId, ...draft };
}

function pageArgs(fixture: AssignmentFixture) {
  return { assignmentId: fixture.assignmentId, paginationOpts: { numItems: 10, cursor: null } };
}

async function fullView(t: TestConvex, submissionId: Id<"submissions">, closed = false) {
  const stored = await storedSubmission(t, submissionId);
  if (stored === null) throw new Error("expected a stored submission");
  return { ...stored, closedWithoutReview: closed };
}

async function creatorView(t: TestConvex, submissionId: Id<"submissions">, closed = false) {
  return withoutReviewerIdentity(await fullView(t, submissionId, closed));
}

type Client = Pick<TestConvex, "mutation" | "query">;
type Caller = (t: TestConvex, fixture: AssignmentFixture) => Promise<Client>;

const nonCreators: [string, Caller, ApiErrorCode][] = [
  ["a signed-out caller", async (t) => t, "not_authenticated"],
  ["a company user", async (_t, fixture) => fixture.asCompany, "forbidden"],
  ["an operator", async (t) => await seedOperator(t, "sc-operator-user"), "forbidden"],
];

const nonCompanyUsers: [string, Caller, ApiErrorCode][] = [
  ["a signed-out caller", async (t) => t, "not_authenticated"],
  ["a creator", async (_t, fixture) => fixture.asCreator, "forbidden"],
  ["an operator", async (t) => await seedOperator(t, "sr-operator-user"), "forbidden"],
];

const fullReaders: [string, Caller][] = [
  ["the company user", async (_t, fixture) => fixture.asCompany],
  ["an operator", async (t) => await seedOperator(t, "sr-reader-operator")],
];

const nonReaders: [string, Caller, ApiErrorCode][] = [
  ["a signed-out caller", async (t) => t, "not_authenticated"],
  [
    "a company user acting on an org they don't belong to",
    async (t) => await seedWrongOrgCaller(t),
    "forbidden",
  ],
];

describe("submissions.create", () => {
  test("submits a pending draft on the caller's own assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t, { usesAiReview: true });

    const id = await fixture.asCreator.mutation(api.submissions.create, createArgs(fixture));

    expect(await storedSubmission(t, id)).toMatchObject({
      ...createArgs(fixture),
      status: "pending",
      usesAiReview: true,
    });
  });

  test.each([
    ["status", "approved"],
    ["usesAiReview", true],
  ] as const)("rejects a client-supplied %s", async (field, value) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t);

    await expect(
      fixture.asCreator.mutation(api.submissions.create, {
        ...createArgs(fixture),
        [field]: value,
        // Bypasses the type check to hit the runtime validator.
      } as never),
    ).rejects.toThrow(`Unexpected field \`${field}\``);

    expect(await storedSubmissions(t)).toHaveLength(0);
  });

  test("rejects another creator's assignment", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t);
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
      const fixture = await seedAssignment(t);
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
    const { fixture, submissionId } = await seedOneSubmission(t);

    const reviewed = await fixture.asCompany.mutation(api.submissions.review, {
      submissionId,
      review: { status: "approved" },
    });

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
    const { fixture, submissionId } = await seedOneSubmission(t);

    const reviewed = await fixture.asCompany.mutation(api.submissions.review, {
      submissionId,
      review: {
        status: "changesRequested",
        reviewNote: "Show `driftwood init` before the deploy.",
      },
    });

    expect(reviewed).toMatchObject({
      status: "changesRequested",
      reviewNote: "Show `driftwood init` before the deploy.",
    });
  });

  test("rejects a change request with no note", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t);

    await expect(
      fixture.asCompany.mutation(api.submissions.review, {
        submissionId,
        // Bypasses the type check to hit the runtime validator.
        review: { status: "changesRequested" },
      } as never),
    ).rejects.toThrow("Validator error: Expected one of");

    expect(await storedSubmission(t, submissionId)).toMatchObject({ status: "pending" });
  });

  test.each([
    ["reviewedBy", "companyUsers|fake"],
    ["reviewerType", "ai"],
  ] as const)("rejects a client-supplied %s", async (field, value) => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t);

    await expect(
      fixture.asCompany.mutation(api.submissions.review, {
        submissionId,
        review: { status: "approved" },
        [field]: value,
        // Bypasses the type check to hit the runtime validator.
      } as never),
    ).rejects.toThrow(`Unexpected field \`${field}\``);

    expect(await storedSubmission(t, submissionId)).toMatchObject({ status: "pending" });
  });

  test("rejects a member of another company", async () => {
    const t = convexTest(schema, modules);
    const { submissionId } = await seedOneSubmission(t);
    const { asMember: asOutsider } = await seedMembership(t, "sr-outsider");

    await expectApiError(
      () =>
        asOutsider.mutation(api.submissions.review, {
          submissionId,
          review: { status: "approved" },
        }),
      "not_found",
    );

    expect(await storedSubmission(t, submissionId)).toMatchObject({ status: "pending" });
  });

  test.each(nonCompanyUsers)("rejects %s without reviewing", async (_label, caller, code) => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t);
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
    const { fixture, submissionId } = await seedOneSubmission(t, "approved");
    const client = await caller(t, fixture);

    const view = await client.query(api.submissions.get, { submissionId });

    expect(view).toEqual(await fullView(t, submissionId));
  });

  test("gives the creator their submission without the reviewer", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, "approved");

    const view = await fixture.asCreator.query(api.submissions.get, { submissionId });

    expect(view).toEqual(await creatorView(t, submissionId));
  });

  test.each(fullReaders)(
    "gives %s an overridden submission with every reviewer",
    async (_label, caller) => {
      const t = convexTest(schema, modules);
      const { fixture, submissionId } = await seedOverriddenSubmission(t);
      const client = await caller(t, fixture);

      const view = await client.query(api.submissions.get, { submissionId });

      expect(view).toEqual(await fullView(t, submissionId));
    },
  );

  test("gives the creator an overridden submission and its dispute, without any reviewer", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOverriddenSubmission(t);

    const view = await fixture.asCreator.query(api.submissions.get, { submissionId });

    expect(view).toEqual(await creatorView(t, submissionId));
    expect(view).toHaveProperty("disputeId");
    expect(view).toHaveProperty("overriddenReview.status", "changesRequested");
  });

  // `not_found`, so another company can't tell it apart from a missing submission.
  test("hides the submission from another company's user", async () => {
    const t = convexTest(schema, modules);
    const { submissionId } = await seedOneSubmission(t);
    const { asMember: asOutsider } = await seedMembership(t, "sg-outsider");

    await expectApiError(
      () => asOutsider.query(api.submissions.get, { submissionId }),
      "not_found",
    );
  });

  test("hides the submission from another creator", async () => {
    const t = convexTest(schema, modules);
    const { submissionId } = await seedOneSubmission(t);
    const asIntruder = await seedUser(t, { subject: "sg-intruder" });

    await expectApiError(
      () => asIntruder.query(api.submissions.get, { submissionId }),
      "not_found",
    );
  });

  test.each(nonReaders)("rejects %s", async (_label, caller, code) => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t);
    const client = await caller(t, fixture);

    await expectApiError(() => client.query(api.submissions.get, { submissionId }), code);
  });
});

describe("submissions.list", () => {
  test.each(fullReaders)(
    "gives %s every submission, newest first, as stored",
    async (_label, caller) => {
      const t = convexTest(schema, modules);
      const fixture = await seedAssignment(t);
      const firstId = await seedSubmission(t, fixture, "changesRequested");
      const secondId = await seedSubmission(t, fixture, "approved");
      const client = await caller(t, fixture);

      const result = await client.query(api.submissions.list, pageArgs(fixture));

      expect(result.page).toEqual([await fullView(t, secondId), await fullView(t, firstId)]);
    },
  );

  test("gives the creator every submission, newest first, without reviewers", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t);
    const firstId = await seedSubmission(t, fixture, "changesRequested");
    const secondId = await seedSubmission(t, fixture, "approved");

    const result = await fixture.asCreator.query(api.submissions.list, pageArgs(fixture));

    expect(result.page).toEqual([await creatorView(t, secondId), await creatorView(t, firstId)]);
  });

  test("hides the assignment from another company's user", async () => {
    const t = convexTest(schema, modules);
    const { fixture } = await seedOneSubmission(t);
    const { asMember: asOutsider } = await seedMembership(t, "sl-outsider");

    await expectApiError(
      () => asOutsider.query(api.submissions.list, pageArgs(fixture)),
      "not_found",
    );
  });

  test("hides the assignment from another creator", async () => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t);
    const asIntruder = await seedUser(t, { subject: "sl-intruder" });

    await expectApiError(
      () => asIntruder.query(api.submissions.list, pageArgs(fixture)),
      "not_found",
    );
  });

  test.each(nonReaders)("rejects %s", async (_label, caller, code) => {
    const t = convexTest(schema, modules);
    const fixture = await seedAssignment(t);
    const client = await caller(t, fixture);

    await expectApiError(() => client.query(api.submissions.list, pageArgs(fixture)), code);
  });
});

describe("closed drafts through the read routes", () => {
  test("get and list mark a draft on a cancelled assignment closed for the company", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, "pending", {
      status: "cancelled",
    });

    const view = await fixture.asCompany.query(api.submissions.get, { submissionId });
    const result = await fixture.asCompany.query(api.submissions.list, pageArgs(fixture));

    const expected = await fullView(t, submissionId, true);
    expect(view).toEqual(expected);
    expect(result.page).toEqual([expected]);
  });

  test("get and list mark a draft on a cancelled assignment closed for the creator", async () => {
    const t = convexTest(schema, modules);
    const { fixture, submissionId } = await seedOneSubmission(t, "pending", {
      status: "cancelled",
    });

    const view = await fixture.asCreator.query(api.submissions.get, { submissionId });
    const result = await fixture.asCreator.query(api.submissions.list, pageArgs(fixture));

    const expected = await creatorView(t, submissionId, true);
    expect(view).toEqual(expected);
    expect(result.page).toEqual([expected]);
  });
});
