import { ConvexError, v, type Infer } from "convex/values";

export const providerStepFailure = v.object({
  ok: v.literal(false),
  retryable: v.boolean(),
  retryAfterMs: v.number(),
  reason: v.union(
    v.literal("transcription_failed"),
    v.literal("review_failed"),
    v.literal("ambiguous_submission"),
    v.literal("disabled"),
    v.literal("timeout"),
  ),
});
export type ProviderStepFailure = Infer<typeof providerStepFailure>;

/** Converts provider exceptions to redacted durable state; unknown errors never trigger paid retries. */
export function providerFailure(
  error: unknown,
  reason: "transcription_failed" | "review_failed",
): ProviderStepFailure {
  const data =
    error instanceof ConvexError && typeof error.data === "object" && error.data !== null
      ? (error.data as Record<string, unknown>)
      : {};
  let failureReason: ProviderStepFailure["reason"] = reason;
  if (data.requestMayHaveSucceeded === true) failureReason = "ambiguous_submission";
  else if (data.reason === "ai_review_timeout") failureReason = "timeout";
  return {
    ok: false,
    reason: failureReason,
    retryable: data.retryable === true && data.requestMayHaveSucceeded !== true,
    retryAfterMs:
      typeof data.retryAfterMs === "number" && Number.isFinite(data.retryAfterMs)
        ? Math.max(0, data.retryAfterMs)
        : 0,
  };
}
