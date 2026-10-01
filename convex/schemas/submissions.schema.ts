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
 * One variant per review outcome, each with `fields`. A change request must tell
 * the creator what to fix, so its note is required; an approval's is optional.
 * Convex can't nest a union inside an object, so each outcome is its own variant.
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
 * Every shape a submission can take: no review yet, an AI review, an attributed
 * company-user review, or an operator override. A human ID cannot be attached
 * to an AI review, and a recorded review always has a timestamp.
 *
 * The stored table and the read view (`submissionView` in models/submissions)
 * are both built from this, so they can't drift apart. The reviewer IDs are
 * required in the table and optional in the view, which leaves them out for
 * creators; `extraFields` adds the view's system fields and derived flag.
 *
 * Each validator is its own type parameter, used directly: reading it off a
 * generic object (`identity.reviewedBy`) makes TypeScript fall back to the
 * constraint, and the stored types would lose their exact IDs.
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
  // The review an operator replaced, kept so the original decision is not lost.
  // Operator reviews cannot themselves be overridden, so only these two appear.
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
