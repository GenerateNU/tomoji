import { apiError } from "./errors";

/**
 * Days a post keeps earning after it goes live - number of days the metrics are tracked on the X post.
 */
export const X_POST_EARNING_DAYS = 30;

export type XMetricsConfig = { enabled: false } | { enabled: true; bearerToken: string };

/**
 * Reads the app-only X settings for post metrics. Every X read is billed, so
 * the sync is off unless a deployment sets the flag to exactly `"true"`.
 */
export function readXMetricsConfig(values: {
  X_METRICS_SYNC_ENABLED?: string;
  X_BEARER_TOKEN?: string;
}): XMetricsConfig {
  if (values.X_METRICS_SYNC_ENABLED !== "true") return { enabled: false };
  const bearerToken = values.X_BEARER_TOKEN?.trim();
  if (!bearerToken) throw apiError("misconfigured", { reason: "x_bearer_token_missing" });
  return { enabled: true, bearerToken };
}
