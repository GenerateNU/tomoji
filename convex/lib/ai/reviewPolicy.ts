import type { CriterionResult } from "./jev";

// An operational starting point, not a calibrated accuracy guarantee. Approve with TLs before enabling.
export const AI_REVIEW_MIN_PROBABILITY = 0.8;
export const AI_REVIEW_MAX_DURATION_SECONDS = 5 * 60;
export const AI_REVIEW_TIMEOUT_MS = 10 * 60_000;
export const AI_REVIEW_POLL_INTERVAL_MS = 10_000;
export const AI_REVIEW_MAX_RETRIES = 3;
export const AI_REVIEW_MAX_POLLS = 60;

export type AiReviewDecision =
  | { status: "approved" }
  | { status: "changesRequested"; failedCriterionIds: string[] }
  | { status: "manualReview" };

/** Uncertainty wins over rejection; only complete, confident evidence permits an automatic decision. */
export function decideAiReview(results: CriterionResult[]): AiReviewDecision {
  if (
    results.length === 0 ||
    results.some(
      (result) =>
        result.outcome === "uncertain" ||
        !(result.probabilities[result.outcome] >= AI_REVIEW_MIN_PROBABILITY),
    )
  )
    return { status: "manualReview" };
  const failedCriterionIds = results
    .filter((result) => result.outcome === "not_met")
    .map((result) => result.criterionId);
  return failedCriterionIds.length
    ? { status: "changesRequested", failedCriterionIds }
    : { status: "approved" };
}
