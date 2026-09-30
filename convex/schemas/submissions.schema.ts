import { defineTable } from "convex/server";
import { v } from "convex/values";

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

const reviewFields = {
    status: reviewedSubmissionStatus,
    // requires for `changesRequested` status
    reviewNote: v.optional(v.string()),
    reviewAt: v.number(), // TODO: Unix milliseconds... recommended but check
};

const aiReviewFields = {
    ...reviewFields,
    reviewerType: v.literal("ai")
};

const companyUserReviewFields = {
    ...reviewFields,
    reviewerType: v.literal("companyyUser"),
    reviewedBy: v.id("companyUsers")
};

/**
 * The review an operator replaced, kept so the original decision is not lost.
 * Operator reviews cannot themselves be overridden, so only these two appear.
 */
export const overriddenReview = v.union(
    v.object(aiReviewFields),
    v.object(companyUserReviewFields),
);

// No review yet, an AI review, or an attributed human review. A human ID cannot
// be attached to an AI review, and a recorded review always has a timestamp.
export const submissionsTable = defineTable(
    v.union(
        v.object({ ...submissionFields, status: v.literal("pending") }),
        v.object({ ...submissionFields, ...aiReviewFields }),
        v.object({ ...submissionFields, ...companyUserReviewFields }),
        // TODO(disputes): written only by the dispute override
        v.object({
            ...submissionFields,
            ...reviewFields,
            reviewerType: v.literal("operator"),
            reviewedByOperator: v.id("users"),
            overriddenReview,
            disputeId: v.optional(v.id("disputes")),
        }),
    ),
)
    .index("by_assignmentId", ["assignmentId"])
    .index("by_reviewedBy", ["reviewedBy"]);
