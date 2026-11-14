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

/** Requests changes for confirmed failures and approves only when every criterion is confidently met. */
export function decideAiReview(results: CriterionResult[]): AiReviewDecision {
  const failedCriterionIds = results
    .filter(
      (result) =>
        result.outcome === "not_met" && result.probabilities.not_met >= AI_REVIEW_MIN_PROBABILITY,
    )
    .map((result) => result.criterionId);
  if (failedCriterionIds.length > 0) return { status: "changesRequested", failedCriterionIds };

  if (
    results.length > 0 &&
    results.every(
      (result) => result.outcome === "met" && result.probabilities.met >= AI_REVIEW_MIN_PROBABILITY,
    )
  )
    return { status: "approved" };
  return { status: "manualReview" };
}
