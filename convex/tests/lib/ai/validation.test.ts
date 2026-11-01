import { expect, test } from "vitest";
import { normalizeReviewCriteria } from "../../../lib/ai/validation";

test("normalizes confirmed criteria and allows clearing them", () => {
  expect(
    normalizeReviewCriteria([{ id: " product ", description: " Mention Driftwood. " }]),
  ).toEqual([{ id: "product", description: "Mention Driftwood." }]);
  expect(normalizeReviewCriteria([])).toEqual([]);
});

test("rejects duplicate IDs after trimming", () => {
  expect(() =>
    normalizeReviewCriteria([
      { id: "product", description: "First" },
      { id: " product ", description: "Second" },
    ]),
  ).toThrow(/duplicate_review_criterion/);
});

test("rejects a blank criterion description", () => {
  expect(() => normalizeReviewCriteria([{ id: "product", description: " " }])).toThrow(
    /reviewCriterionDescription_blank/,
  );
});

test("rejects an overlong criterion description", () => {
  expect(() => normalizeReviewCriteria([{ id: "product", description: "x".repeat(1001) }])).toThrow(
    /reviewCriterionDescription_too_long/,
  );
});

test("rejects more than 20 criteria", () => {
  expect(() =>
    normalizeReviewCriteria(
      Array.from({ length: 21 }, (_, i) => ({ id: String(i), description: "Mention Driftwood." })),
    ),
  ).toThrow(/too_many_review_criteria/);
});
