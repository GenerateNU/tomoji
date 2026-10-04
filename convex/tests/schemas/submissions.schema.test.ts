/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "../../schema";
import { seedAssignmentFixture, type TestConvex } from "../helpers";

const modules = import.meta.glob("../../**/*.ts");

type ReviewerKind = "ai" | "companyUser" | "operator";
const reviewerKinds: ReviewerKind[] = ["ai", "companyUser", "operator"];

/** Inserts reviewed submissions straight into the table, so only the schema decides. */
async function rawReviewInserter(t: TestConvex) {
  const fixture = await seedAssignmentFixture(t);
  const operatorId = await t.run(
    async (ctx) =>
      await ctx.db.insert("users", {
        workosId: "schema-operator",
        email: "operator@example.com",
        role: "operator",
        isActive: true,
      }),
  );
  const reviewerFields = {
    ai: { reviewerType: "ai" },
    companyUser: { reviewerType: "companyUser", reviewedBy: fixture.membership._id },
    operator: {
      reviewerType: "operator",
      reviewedByOperator: operatorId,
      overriddenReview: { status: "approved", reviewerType: "ai", reviewedAt: 1 },
    },
  };

  return (kind: ReviewerKind, review: Record<string, unknown>) =>
    t.run(
      async (ctx) =>
        await ctx.db.insert("submissions", {
          assignmentId: fixture.assignmentId,
          draftUrl: "https://drive.example.com/drafts/driftwood-cli-screencast",
          draftDescription: "Screencast: installing the Driftwood CLI and running a first deploy.",
          usesAiReview: false,
          reviewedAt: 2,
          ...reviewerFields[kind],
          ...review,
          // Bypasses the type check to hit the schema validator.
        } as never),
    );
}

describe("submissions schema: review notes", () => {
  test.each(reviewerKinds)("rejects a change request with no note (reviewer: %s)", async (kind) => {
    const t = convexTest(schema, modules);
    const insert = await rawReviewInserter(t);

    await expect(insert(kind, { status: "changesRequested" })).rejects.toThrow();
  });

  test.each(reviewerKinds)("accepts a change request with a note (reviewer: %s)", async (kind) => {
    const t = convexTest(schema, modules);
    const insert = await rawReviewInserter(t);

    await expect(
      insert(kind, {
        status: "changesRequested",
        reviewNote: "Add #ad to the caption before posting.",
      }),
    ).resolves.toBeDefined();
  });

  test.each(reviewerKinds)("accepts an approval with no note (reviewer: %s)", async (kind) => {
    const t = convexTest(schema, modules);
    const insert = await rawReviewInserter(t);

    await expect(insert(kind, { status: "approved" })).resolves.toBeDefined();
  });

  test("rejects an overridden change request with no note", async () => {
    const t = convexTest(schema, modules);
    const insert = await rawReviewInserter(t);

    await expect(
      insert("operator", {
        status: "approved",
        overriddenReview: { status: "changesRequested", reviewerType: "ai", reviewedAt: 1 },
      }),
    ).rejects.toThrow();
  });
});
