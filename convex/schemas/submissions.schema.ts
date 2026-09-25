import { defineTable } from "convex/server";
import { v } from "convex/values";

export const submissionStatus = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("changesRequested"),
);

const submissionFields = {
  assignmentId: v.id("assignments"),
  draftUrl: v.string(),
  draftDescription: v.string(),
  status: submissionStatus,
  reviewNote: v.optional(v.string()),
};

// No review yet, an AI review, or an attributed human review. A human ID cannot
// be attached to an AI review, and a recorded review always has a timestamp.
export const submissionsTable = defineTable(
  v.union(
    v.object({ ...submissionFields, status: v.literal("pending") }),
    v.object({
      ...submissionFields,
      reviewerType: v.literal("ai"),
      reviewedAt: v.number(), // Unix milliseconds.
    }),
    v.object({
      ...submissionFields,
      reviewerType: v.literal("companyUser"),
      reviewedBy: v.id("companyUsers"),
      reviewedAt: v.number(), // Unix milliseconds.
    }),
  ),
)
  .index("by_assignmentId", ["assignmentId"])
  .index("by_reviewedBy", ["reviewedBy"]);
