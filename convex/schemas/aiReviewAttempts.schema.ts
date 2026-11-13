import { defineTable } from "convex/server";
import { v } from "convex/values";
import { aiReviewResult, completedTranscription, reviewCriterion } from "../lib/ai/validation";

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
  transcriptionJobId: v.optional(v.string()),
  transcription: v.optional(completedTranscription),
  result: v.optional(aiReviewResult),
  startedAt: v.optional(v.number()),
  finishedAt: v.optional(v.number()),
  failureReason: v.optional(
    v.union(
      v.literal("transcription_failed"),
      v.literal("review_failed"),
      v.literal("uncertain"),
      v.literal("ambiguous_submission"),
    ),
  ),
}).index("by_submissionId", ["submissionId"]);
