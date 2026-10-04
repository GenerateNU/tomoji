import { defineTable } from "convex/server";
import {
  v,
  type GenericId as Id,
  type OptionalProperty,
  type PropertyValidators,
  type Validator,
} from "convex/values";

/** The outcomes a review can record. A submission with no review is `pending`. */
export const reviewedSubmissionStatus = v.union(
  v.literal("approved"),
  v.literal("changesRequested"),
);

export const submissionStatus = v.union(v.literal("pending"), ...reviewedSubmissionStatus.members);

const submissionFields = {
  assignmentId: v.id("assignments"),
  draftUrl: v.string(),
  draftDescription: v.string(),
  // Source of truth for who completes first review
  usesAiReview: v.boolean(),
};

/**
 * One variant per outcome, since Convex can't nest a union inside an object. A
 * change request must tell the creator what to fix, so its note is required.
 */
function reviewOutcomeVariants<Fields extends PropertyValidators>(fields: Fields) {
  return [
    v.object({ ...fields, status: v.literal("approved"), reviewNote: v.optional(v.string()) }),
    v.object({ ...fields, status: v.literal("changesRequested"), reviewNote: v.string() }),
  ] as const;
}

/** A validator for a reviewer ID: required in the table, optional in the read view. */
type ReviewerIdValidator<TableName extends "companyUsers" | "users"> = Validator<
  Id<TableName> | undefined,
  OptionalProperty,
  string
>;

/**
 * Every shape a submission can take. The table and the read view
 * (`submissionView`) are both built from this, so they can't drift apart.
 *
 * Each reviewer-ID validator is its own type parameter: read off a generic
 * object instead, TypeScript falls back to the constraint and the IDs become `any`.
 */
export function submissionShapes<
  ReviewedBy extends ReviewerIdValidator<"companyUsers">,
  ReviewedByOperator extends ReviewerIdValidator<"users">,
  Extra extends PropertyValidators,
>(reviewedBy: ReviewedBy, reviewedByOperator: ReviewedByOperator, extraFields: Extra) {
  const base = { ...submissionFields, ...extraFields };
  const aiReview = {
    reviewerType: v.literal("ai"),
    reviewedAt: v.number(), // Unix milliseconds.
  };
  const companyUserReview = {
    reviewerType: v.literal("companyUser"),
    reviewedBy,
    reviewedAt: v.number(), // Unix milliseconds.
  };
  // The review an operator replaced. Operator reviews can't be overridden themselves.
  const overriddenReview = v.union(
    ...reviewOutcomeVariants(aiReview),
    ...reviewOutcomeVariants(companyUserReview),
  );

  return [
    v.object({ ...base, status: v.literal("pending") }),
    ...reviewOutcomeVariants({ ...base, ...aiReview }),
    ...reviewOutcomeVariants({ ...base, ...companyUserReview }),
    // TODO(disputes): written only by the dispute override
    ...reviewOutcomeVariants({
      ...base,
      reviewerType: v.literal("operator"),
      reviewedByOperator,
      reviewedAt: v.number(), // Unix milliseconds.
      overriddenReview,
      disputeId: v.optional(v.id("disputes")),
    }),
  ] as const;
}

export const submissionsTable = defineTable(
  v.union(...submissionShapes(v.id("companyUsers"), v.id("users"), {})),
)
  .index("by_assignmentId", ["assignmentId"])
  .index("by_reviewedBy", ["reviewedBy"]);
