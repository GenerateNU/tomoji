import { apiError } from "../errors";

export type AiProvider = "assemblyai" | "jev" | "x";
const REQUEST_TIMEOUT_MS = 15_000;

/** Requires server-only keys when the review pipeline is invoked, not at module load. */
export function readAiReviewConfig(values: {
  ASSEMBLYAI_API_KEY?: string;
  TYPESAFE_API_KEY?: string;
}): { assemblyAiKey: string; jevKey: string } {
  const assemblyAiKey = values.ASSEMBLYAI_API_KEY?.trim();
  const jevKey = values.TYPESAFE_API_KEY?.trim();
  if (!assemblyAiKey || !jevKey)
    throw apiError("misconfigured", { reason: "ai_review_config_missing" });
  return { assemblyAiKey, jevKey };
}

/** Rejects malformed provider data without exposing transcripts, URLs, or credentials. */
export function invalidProviderResponse(provider: AiProvider, requestMayHaveSucceeded = false) {
  return apiError("upstream_failure", {
    provider,
    reason: "invalid_response",
    retryable: false,
    requestMayHaveSucceeded,
  });
}

/** Narrows external JSON objects before their fields are inspected. */
export function providerObject(value: unknown, provider: AiProvider): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw invalidProviderResponse(provider);
  return value as Record<string, unknown>;
}

/** Separates transient timeouts from malformed responses without exposing provider errors. */
function requestFailure(provider: AiProvider, submission: boolean, timedOut: boolean) {
  return apiError("upstream_failure", {
    provider,
    reason: timedOut ? "request_timeout" : "request_failed",
    retryable: timedOut || !submission,
    requestMayHaveSucceeded: submission,
  });
}

/** The request owns its timeout signal; body reads can also reject with a timeout DOMException. */
function isTimeout(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === "TimeoutError");
}

/** Makes one bounded request; callers own retries and reconciliation of ambiguous submissions. */
export async function requestAiProvider(
  provider: AiProvider,
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  // Provider POSTs can incur a charge before a response is lost.
  const submission = init.method?.toUpperCase() === "POST";
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "error",
      signal,
    });
  } catch (error) {
    throw requestFailure(provider, submission, isTimeout(error, signal));
  }
  if (!response.ok) {
    const transient = response.status === 429 || response.status >= 500;
    const retryAfter = response.headers.get("Retry-After");
    let retryAfterMs = 0;
    if (retryAfter !== null) {
      if (/^\d+$/.test(retryAfter)) retryAfterMs = Number(retryAfter) * 1000;
      else retryAfterMs = Math.max(0, Date.parse(retryAfter) - Date.now());
    }
    throw apiError(
      response.status === 401 || response.status === 403 ? "misconfigured" : "upstream_failure",
      {
        provider,
        reason: "request_rejected",
        status: response.status,
        retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : 0,
        retryable: transient && !(submission && response.status >= 500),
        requestMayHaveSucceeded: submission && response.status >= 500,
      },
    );
  }
  try {
    const value: unknown = await response.json();
    return providerObject(value, provider);
  } catch (error) {
    if (isTimeout(error, signal)) throw requestFailure(provider, submission, true);
    throw invalidProviderResponse(provider, submission);
  }
}
