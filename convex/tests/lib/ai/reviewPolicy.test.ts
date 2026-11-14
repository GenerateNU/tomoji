import { expect, test } from "vitest";
import { decideAiReview } from "../../../lib/ai/reviewPolicy";

import { aiReviewResultArgs } from "../../helpers";

const met = aiReviewResultArgs().results[0];

test("approves only when every criterion is confidently met", () => {
  expect(
    decideAiReview([
      met,
      {
        ...met,
        criterionId: "disclosure",
        probabilities: { met: 0.8, not_met: 0.15, uncertain: 0.05 },
      },
    ]),
  ).toEqual({ status: "approved" });
});

test("requests changes for a confident failure", () => {
  expect(
    decideAiReview([
      { ...met, outcome: "not_met", probabilities: { met: 0.02, not_met: 0.96, uncertain: 0.02 } },
    ]),
  ).toEqual({ status: "changesRequested", failedCriterionIds: ["product"] });
});

test("uncertainty takes precedence over a confident failure", () => {
  expect(
    decideAiReview([
      { ...met, outcome: "not_met", probabilities: { met: 0.02, not_met: 0.96, uncertain: 0.02 } },
      {
        ...met,
        criterionId: "visual",
        outcome: "uncertain",
        probabilities: { met: 0.01, not_met: 0.01, uncertain: 0.98 },
      },
    ]),
  ).toEqual({ status: "manualReview" });
});

test("low probability does not become automatic approval", () => {
  expect(
    decideAiReview([{ ...met, probabilities: { met: 0.79, not_met: 0.16, uncertain: 0.05 } }]),
  ).toEqual({ status: "manualReview" });
});

test("missing results never approve", () => {
  expect(decideAiReview([])).toEqual({ status: "manualReview" });
});

test("uses the selected outcome probability rather than the provider's confidence statistic", () => {
  expect(
    decideAiReview([
      {
        ...met,
        confidence: 0.88,
        probabilities: { met: 0.92, not_met: 0.07, uncertain: 0.01 },
      },
    ]),
  ).toEqual({ status: "approved" });
});

test("approves the reproduced sponsorship score of 87 percent", () => {
  expect(
    decideAiReview([
      {
        ...met,
        criterionId: "sponsor_disclosure",
        confidence: 0.8,
        probabilities: { met: 0.87, not_met: 0.08, uncertain: 0.05 },
      },
    ]),
  ).toEqual({ status: "approved" });
});

test("requests changes at the 80 percent boundary", () => {
  expect(
    decideAiReview([
      {
        ...met,
        outcome: "not_met",
        probabilities: { met: 0.15, not_met: 0.8, uncertain: 0.05 },
      },
    ]),
  ).toEqual({ status: "changesRequested", failedCriterionIds: ["product"] });
});
