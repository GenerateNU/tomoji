import { v, type Infer } from "convex/values";
import { apiError } from "../errors";
import { requireNonBlank } from "../validation";

export const MAX_REVIEW_CRITERIA = 20;
export const reviewCriterion = v.object({ id: v.string(), description: v.string() });
export const reviewOutcome = v.union(
  v.literal("met"),
  v.literal("not_met"),
  v.literal("uncertain"),
);
export const criterionResult = v.object({
  criterionId: v.string(),
  outcome: reviewOutcome,
  confidence: v.number(),
  probabilities: v.object({ met: v.number(), not_met: v.number(), uncertain: v.number() }),
});
export const transcriptWord = v.object({
  text: v.string(),
  startMs: v.number(),
  endMs: v.number(),
});
export const completedTranscription = v.object({
  id: v.string(),
  status: v.literal("completed"),
  text: v.string(),
  words: v.array(transcriptWord),
  durationSeconds: v.number(),
  model: v.string(),
});
export const aiReviewResult = v.object({
  model: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  results: v.array(criterionResult),
});

/** Bounds company-confirmed criteria and gives each a unique stable ID after trimming. */
export function normalizeReviewCriteria(
  criteria: Infer<typeof reviewCriterion>[],
): Infer<typeof reviewCriterion>[] {
  if (criteria.length > MAX_REVIEW_CRITERIA)
    throw apiError("invalid_state", { reason: "too_many_review_criteria" });
  const normalized = criteria.map((criterion) => ({
    id: requireNonBlank(criterion.id, "reviewCriterionId", 100),
    description: requireNonBlank(criterion.description, "reviewCriterionDescription", 1000),
  }));
  if (new Set(normalized.map((criterion) => criterion.id)).size !== normalized.length)
    throw apiError("invalid_state", { reason: "duplicate_review_criterion" });
  return normalized;
}
