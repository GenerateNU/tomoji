import { defineTable } from "convex/server";
import { v } from "convex/values";
import { aiReviewResult, completedTranscription, reviewCriterion } from "../lib/ai/validation";

export const aiReviewFailureReason = v.union(
  v.literal("transcription_failed"),
  v.literal("review_failed"),
  v.literal("uncertain"),
  v.literal("low_probability"),
  v.literal("ambiguous_submission"),
  v.literal("disabled"),
  v.literal("timeout"),
  v.literal("duration_exceeded"),
  v.literal("no_speech"),
);

/** Operational review data stays separate from the submission's business status. */
export const aiReviewAttemptsTable = defineTable({
  submissionId: v.id("submissions"),
  mediaId: v.id("mediaUploads"),
  criteria: v.array(reviewCriterion),
  // TODO(#177/#178): reconcile this brief snapshot with Afnan's schema updates before merge.
  context: v.object({
    title: v.string(),
    description: v.string(),
    contentRequirements: v.string(),
    prohibitedClaims: v.string(),
    disclosureRequirements: v.string(),
  }),
  status: v.union(
    v.literal("ready"),
    v.literal("transcribing"),
    v.literal("evaluating"),
    v.literal("completed"),
    v.literal("manualReview"),
  ),
  workflowId: v.optional(v.string()),
  dispatchStartedAt: v.optional(v.number()),
  deadlineAt: v.optional(v.number()),
  transcriptionJobId: v.optional(v.string()),
  transcription: v.optional(completedTranscription),
  result: v.optional(aiReviewResult),
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
  failureReason: v.optional(aiReviewFailureReason),
}).index("by_submissionId", ["submissionId"]);
