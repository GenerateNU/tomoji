import { afterEach, expect, test, vi } from "vitest";
import { evaluateTranscript } from "../../../lib/ai/jev";
import { expectApiError, jevReviewResponse } from "../../helpers";

const criteria = [{ id: "product", description: "Mention Driftwood." }];

afterEach(() => vi.unstubAllGlobals());

test("batches criteria in one pinned-model request and returns criterion decisions", async () => {
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      model: "jev-1.14.0",
      answers: {
        criterion_0: {
          type: "choice",
          choice: "met",
          confidence: 0.9,
          probabilities: { met: 0.95, not_met: 0.03, uncertain: 0.02 },
        },
        criterion_1: {
          type: "choice",
          choice: "not_met",
          confidence: 0.8,
          probabilities: { met: 0.05, not_met: 0.9, uncertain: 0.05 },
        },
      },
      usage: { input_tokens: 400, output_tokens: 20 },
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const result = await evaluateTranscript("test-key", "I deploy with Driftwood.", [
    { id: "product", description: "Mention Driftwood." },
    { id: "disclosure", description: "Disclose the sponsorship verbally." },
  ]);
  expect(result).toEqual({
    model: "jev-1.14.0",
    inputTokens: 400,
    outputTokens: 20,
    results: [
      {
        criterionId: "product",
        outcome: "met",
        confidence: 0.9,
        probabilities: { met: 0.95, not_met: 0.03, uncertain: 0.02 },
      },
      {
        criterionId: "disclosure",
        outcome: "not_met",
        confidence: 0.8,
        probabilities: { met: 0.05, not_met: 0.9, uncertain: 0.05 },
      },
    ],
  });
  const [url, request] = fetch.mock.calls[0];
  expect(url).toBe("https://api.typesafe.ai/v1/systemone");
  expect(request.headers.Authorization).toBe("Bearer test-key");
  const body = JSON.parse(request.body);
  expect(body.model).toBe("jev-1.14.0");
  expect(body.state).toEqual({ transcript: "I deploy with Driftwood." });
  expect(Object.keys(body.questions)).toEqual(["criterion_0", "criterion_1"]);
  expect(body.questions.criterion_0.instructions.requirement).toBe("Mention Driftwood.");
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("preserves uncertain results for the caller's manual-review policy", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jevReviewResponse()));
  const result = await evaluateTranscript("test-key", "Some deployment tool.", criteria);
  expect(result.results).toEqual([
    {
      criterionId: "product",
      outcome: "uncertain",
      confidence: 0.3,
      probabilities: { met: 0.3, not_met: 0.3, uncertain: 0.4 },
    },
  ]);
});

test("rejects missing criteria answers rather than treating them as passing", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jevReviewResponse({ answers: {} })));
  await expectApiError(
    () => evaluateTranscript("test-key", "Driftwood.", criteria),
    "upstream_failure",
  );
});

test("rejects invalid probability distributions", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      jevReviewResponse({
        answers: {
          criterion_0: {
            type: "choice",
            choice: "met",
            confidence: 0.9,
            probabilities: { met: 1.2, not_met: -0.2, uncertain: 0 },
          },
        },
      }),
    ),
  );
  await expectApiError(
    () => evaluateTranscript("test-key", "Driftwood.", criteria),
    "upstream_failure",
  );
});

test("rejects an unexpected model version", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jevReviewResponse({ model: "jev-latest" })));
  await expectApiError(
    () => evaluateTranscript("test-key", "Driftwood.", criteria),
    "upstream_failure",
  );
});

test("rejects empty speech, missing criteria, and duplicate IDs without model calls", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expectApiError(() => evaluateTranscript("test-key", " ", criteria), "invalid_state");
  await expectApiError(() => evaluateTranscript("test-key", "Driftwood.", []), "invalid_state");
  await expectApiError(
    () => evaluateTranscript("test-key", "Driftwood.", [...criteria, ...criteria]),
    "invalid_state",
  );
  expect(fetch).not.toHaveBeenCalled();
});

test("bounds the request before sending it to the model", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  await expectApiError(
    () => evaluateTranscript("test-key", "x".repeat(60_000), criteria),
    "invalid_state",
    "review_input_too_large",
  );
  expect(fetch).not.toHaveBeenCalled();
});
