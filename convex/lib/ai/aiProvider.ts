import { apiError } from "../errors";

export type AiProvider = "assemblyai" | "jev";
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

/** Makes one bounded request; callers own retries and reconciliation of ambiguous submissions. */
export async function requestAiProvider(
  provider: AiProvider,
  url: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const submission = provider === "assemblyai" && init.method === "POST";
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw apiError("upstream_failure", {
      provider,
      reason: "request_failed",
      retryable: !submission,
      requestMayHaveSucceeded: submission,
    });
  }
  if (!response.ok) {
    const transient = response.status === 429 || response.status >= 500;
    throw apiError(
      response.status === 401 || response.status === 403 ? "misconfigured" : "upstream_failure",
      {
        provider,
        reason: "request_rejected",
        status: response.status,
        retryable: transient && !(submission && response.status >= 500),
        requestMayHaveSucceeded: submission && response.status >= 500,
      },
    );
  }
  try {
    const value: unknown = await response.json();
    return providerObject(value, provider);
  } catch {
    throw invalidProviderResponse(provider, submission);
  }
}
