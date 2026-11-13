import { afterEach, expect, test, vi } from "vitest";
import { readAiReviewConfig } from "../../../lib/ai/aiProvider";
import { getTranscription, submitTranscription } from "../../../lib/ai/assemblyAi";
import { evaluateTranscript } from "../../../lib/ai/jev";
import { expectApiError } from "../../helpers";

afterEach(() => vi.unstubAllGlobals());

test("requires both backend credentials without exposing their values", () => {
  expect(() => readAiReviewConfig({ ASSEMBLYAI_API_KEY: "secret" })).toThrow(
    /ai_review_config_missing/,
  );
  expect(
    readAiReviewConfig({ ASSEMBLYAI_API_KEY: " assembly ", TYPESAFE_API_KEY: " jev " }),
  ).toEqual({ assemblyAiKey: "assembly", jevKey: "jev" });
});

test("marks rate limits retryable without retrying automatically", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("private provider error", { status: 429 }));
  vi.stubGlobal("fetch", fetch);
  await expect(getTranscription("test-key", "transcript-1")).rejects.toMatchObject({
    data: { code: "upstream_failure", provider: "assemblyai", status: 429, retryable: true },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("classifies rejected credentials as configuration failures", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret", { status: 401 })));
  await expectApiError(() => getTranscription("test-key", "transcript-1"), "misconfigured");
});

test("does not retry a transcription submission after an ambiguous server failure", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("secret signed URL", { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  await expect(
    submitTranscription("test-key", "https://media.example.com/video"),
  ).rejects.toMatchObject({
    data: { retryable: false, requestMayHaveSucceeded: true, status: 503 },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("redacts network errors while distinguishing safe reads from ambiguous submissions", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret-key and signed URL")));
  await expect(getTranscription("test-key", "transcript-1")).rejects.toMatchObject({
    data: { code: "upstream_failure", reason: "request_failed", retryable: true },
    message: expect.not.stringContaining("secret-key"),
  });
  await expect(
    submitTranscription("test-key", "https://media.example.com/video"),
  ).rejects.toMatchObject({
    data: { retryable: false, requestMayHaveSucceeded: true },
  });
});

test("Jev server errors preserve the ambiguous billed request", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("secret", { status: 500 })));
  await expect(
    evaluateTranscript("test-key", "Driftwood.", [
      { id: "product", description: "Mention Driftwood." },
    ]),
  ).rejects.toMatchObject({
    data: { provider: "jev", retryable: false, requestMayHaveSucceeded: true },
  });
});

test("Jev network failures preserve the ambiguous billed request", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("private Jev request"));
  vi.stubGlobal("fetch", fetch);
  await expect(
    evaluateTranscript("test-key", "Driftwood.", [
      { id: "product", description: "Mention Driftwood." },
    ]),
  ).rejects.toMatchObject({
    data: { provider: "jev", retryable: false, requestMayHaveSucceeded: true },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("response-body timeouts are retryable for transcription reads", async () => {
  const response = new Response();
  vi.spyOn(response, "json").mockRejectedValue(new DOMException("private body", "TimeoutError"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
  await expect(getTranscription("test-key", "transcript-1")).rejects.toMatchObject({
    data: { reason: "request_timeout", retryable: true, requestMayHaveSucceeded: false },
  });
});

test("Jev response-body timeouts remain ambiguous even though the failure is transient", async () => {
  const response = new Response();
  vi.spyOn(response, "json").mockRejectedValue(new DOMException("private body", "TimeoutError"));
  const fetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetch);
  await expect(
    evaluateTranscript("test-key", "Driftwood.", [
      { id: "product", description: "Mention Driftwood." },
    ]),
  ).rejects.toMatchObject({
    data: {
      provider: "jev",
      reason: "request_timeout",
      retryable: true,
      requestMayHaveSucceeded: true,
    },
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("malformed submission responses preserve the ambiguous outcome", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not JSON")));
  await expect(
    submitTranscription("test-key", "https://media.example.com/video"),
  ).rejects.toMatchObject({
    data: { reason: "invalid_response", retryable: false, requestMayHaveSucceeded: true },
  });
});

test("aborts stalled requests and refuses redirects", async () => {
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
  const fetch = vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener("abort", () =>
          reject(new Error("private transport failure")),
        );
      }),
  );
  vi.stubGlobal("fetch", fetch);
  try {
    const request = getTranscription("test-key", "transcript-1");
    const assertion = expectApiError(() => request, "upstream_failure", "request_timeout");
    controller.abort();
    await assertion;
    expect(timeout).toHaveBeenCalledWith(15_000);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: "error", signal: controller.signal }),
    );
  } finally {
    timeout.mockRestore();
  }
});

test("preserves provider backoff without leaking the response body", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response("secret", { status: 429, headers: { "Retry-After": "12" } })),
  );
  await expect(getTranscription("test-key", "transcript-1")).rejects.toMatchObject({
    data: { retryable: true, retryAfterMs: 12000 },
  });
});
