import type { ConvexError } from "convex/values";
import { apiError, type ApiErrorData } from "./errors";
import type { PostEngagement } from "../models/posts";

/**
 * Days a post keeps earning after it goes live - number of days the metrics are tracked on the X post.
 */
export const X_POST_EARNING_DAYS = 30;

const requestTimeoutMs = 8_000;
// X's documented limit for one post lookup.
const maxPostsPerLookup = 100;

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

/** Narrows provider JSON before inspecting any untrusted fields. */
export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw apiError("upstream_failure");
  return value as Record<string, unknown>;
}

/** Names the error for a failed response, or `undefined` for a generic `upstream_failure`. */
export type XFailure = (response: Response) => ConvexError<ApiErrorData> | undefined;

/**
 * Performs one bounded request, redacting network errors and rejecting redirects.
 * `failure` runs only when X responds with an error status.
 */
export async function xRequest(
  path: string,
  init: RequestInit,
  failure: XFailure = () => undefined,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(`https://api.x.com/2/${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
  } catch {
    throw apiError("upstream_failure");
  }
  if (!response.ok) throw failure(response) ?? apiError("upstream_failure");
  return response;
}

/**
 * Adds `retryAt` (Unix ms) from X's `x-rate-limit-reset` header, which is Unix
 * seconds, when present and well formed.
 */
function rateLimited(response: Response): ConvexError<ApiErrorData> | undefined {
  if (response.status !== 429) return undefined;
  const reset = response.headers.get("x-rate-limit-reset");
  const retryAt = reset !== null && /^\d+$/.test(reset) ? Number(reset) * 1000 : NaN;
  return apiError("upstream_failure", {
    reason: "x_rate_limited",
    ...(Number.isSafeInteger(retryAt) ? { retryAt } : {}),
  });
}

/** Parses JSON without forwarding an upstream payload or error to callers. */
export async function xJson(response: Response): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw apiError("upstream_failure");
  }
  return object(value);
}

/**
 * One post's counts. `views` is what payouts use (`updatePostViews`).
 * `engagement` is for analytics (`updatePostEngagement`): each unusable count
 * is left out on its own, so it never holds back the views or the other counts.
 */
export type XPostResult = { xPostId: string; views: number; engagement: PostEngagement };

/**
 * Why a requested post has no counts. `invalid_id` was never sent because X
 * would reject it; `not_returned` is a post X left out without saying why, so
 * it may come back on a later run.
 */
export type XMissingReason =
  | "invalid_id"
  | "not_found"
  | "not_authorized"
  | "not_returned"
  | "malformed";

export type XMissingPost = { xPostId: string; reason: XMissingReason };

// X's documented id format; ids never start with 0.
// TODO(posts): requirePostUrl accepts up to 25 digits and leading zeros, so
// links that can never be looked up are stored; tighten it to this format.
const xPostIdPattern = /^[1-9]\d{0,18}$/;

/** Reads the exact linked post's full caption, including long-form text. */
export async function getXPostText(bearerToken: string, xPostId: string): Promise<string> {
  if (!xPostIdPattern.test(xPostId))
    throw apiError("invalid_state", { reason: "x_post_id_invalid" });
  const response = await xJson(
    await xRequest(
      `tweets/${xPostId}?post.fields=note_post,entities`,
      { headers: { Authorization: `Bearer ${bearerToken}` } },
      rateLimited,
    ),
  );
  const post = object(response.data);
  const caption = post.note_post === undefined ? post : object(post.note_post);
  if (post.id !== xPostId || typeof caption.text !== "string")
    throw apiError("upstream_failure", { reason: "invalid_response" });
  const entities = caption.entities ?? post.entities;
  const urls = entities === undefined ? undefined : object(entities).urls;
  return restoreCaptionLinks(caption.text.trimEnd(), urls);
}

/** Drops X's trailing media link and restores creator links before exact comparison. */
function restoreCaptionLinks(text: string, urls: unknown): string {
  if (!Array.isArray(urls)) return text;
  const destinations = new Map<string, string>();
  for (const entry of urls) {
    const { url, expanded_url: expandedUrl, media_key: mediaKey } = object(entry);
    if (typeof url !== "string" || !/^https:\/\/t\.co\/[A-Za-z0-9]+$/.test(url)) continue;
    if (typeof mediaKey === "string") {
      if (text.endsWith(` ${url}`)) text = text.slice(0, -url.length - 1);
      continue;
    }
    if (typeof expandedUrl === "string" && isCaptionDestination(expandedUrl)) {
      destinations.set(url, expandedUrl);
    }
  }
  // Match short links as tokens so one entity cannot rewrite part of another URL.
  return text.replace(
    /(^|[\s([{“"'])(https:\/\/t\.co\/[A-Za-z0-9]+)(?=$|[\s.,!?;:)\]}”"'])/g,
    (match, prefix: string, shortUrl: string) => {
      const destination = destinations.get(shortUrl);
      return destination === undefined ? match : prefix + destination;
    },
  );
}

/** Checks that X returned an HTTP(S) destination and preserves its exact spelling for comparison. */
function isCaptionDestination(value: string): boolean {
  if (!/^https?:\/\/[^\s]+$/i.test(value)) return false;
  try {
    const url = new URL(value);
    return url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

/**
 * Looks up current public counts for up to 100 posts with the app-only token.
 * One unusable post never fails the batch: ids X would reject, posts X leaves
 * out, and posts without usable views come back in `missing` with a reason.
 *
 * @throws `invalid_state` for an empty, oversized, or duplicated id list, which
 *   is a bug in the caller.
 * @throws `upstream_failure` when the response can't be matched to the
 *   requested posts, or with reason `x_rate_limited` on HTTP 429, plus
 *   `retryAt` when X says when the limit resets, so callers can stop the run
 *   instead of retrying.
 */
export async function getXPostMetrics(
  bearerToken: string,
  xPostIds: string[],
): Promise<{ found: XPostResult[]; missing: XMissingPost[] }> {
  if (
    xPostIds.length === 0 ||
    xPostIds.length > maxPostsPerLookup ||
    new Set(xPostIds).size !== xPostIds.length
  )
    throw apiError("invalid_state", { reason: "x_post_ids_invalid" });
  const requested = new Set(xPostIds.filter((id) => xPostIdPattern.test(id)));
  // Every read is billed, so a batch with nothing valid never calls X.
  const response =
    requested.size === 0
      ? {}
      : await xJson(
          await xRequest(
            `tweets?ids=${[...requested].join(",")}&tweet.fields=public_metrics`,
            { headers: { Authorization: `Bearer ${bearerToken}` } },
            rateLimited,
          ),
        );
  const returned = returnedPosts(response.data, requested);
  const reasons = missingReasons(response.errors);
  const found: XPostResult[] = [];
  const missing: XMissingPost[] = [];
  for (const xPostId of xPostIds) {
    if (!requested.has(xPostId)) {
      missing.push({ xPostId, reason: "invalid_id" });
      continue;
    }
    const post = returned.get(xPostId);
    const result = post && postResult(xPostId, post.public_metrics);
    if (result) found.push(result);
    else
      missing.push({
        xPostId,
        reason: post ? "malformed" : (reasons.get(xPostId) ?? "not_returned"),
      });
  }
  return { found, missing };
}

/**
 * Indexes returned posts by id. A post that isn't one we asked for, or appears
 * twice, means the response can't be trusted for any post, so it fails whole.
 * X omits `data` when nothing matched.
 */
function returnedPosts(
  value: unknown,
  requested: Set<string>,
): Map<string, Record<string, unknown>> {
  if (value !== undefined && !Array.isArray(value)) throw apiError("upstream_failure");
  const returned = new Map<string, Record<string, unknown>>();
  for (const item of value ?? []) {
    const post = object(item);
    if (typeof post.id !== "string" || !requested.has(post.id) || returned.has(post.id))
      throw apiError("upstream_failure");
    returned.set(post.id, post);
  }
  return returned;
}

/**
 * Reads why X left posts out. Only a label, so unreadable entries are skipped.
 * Types X doesn't document are logged, so a change in its error format shows up.
 */
function missingReasons(value: unknown): Map<string, XMissingReason> {
  const reasons = new Map<string, XMissingReason>();
  if (!Array.isArray(value)) return reasons;
  for (const entry of value) {
    if (entry === null || typeof entry !== "object") continue;
    const { resource_id: id, type } = entry as Record<string, unknown>;
    if (typeof id !== "string" || typeof type !== "string") continue;
    if (type.endsWith("/resource-not-found")) reasons.set(id, "not_found");
    else if (type.endsWith("/not-authorized-for-resource")) reasons.set(id, "not_authorized");
    else console.warn("X post lookup: unrecognized problem type", { xPostId: id, type });
  }
  return reasons;
}

/**
 * The post's counts, or `undefined` if its views are missing or not a
 * nonnegative whole number. Unusable engagement counts are left out instead.
 */
function postResult(xPostId: string, value: unknown): XPostResult | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const metrics = value as Record<string, unknown>;
  const views = count(metrics.impression_count);
  if (views === undefined) return undefined;
  const engagement: PostEngagement = {};
  for (const [field, xField] of [
    ["likes", "like_count"],
    ["comments", "reply_count"],
    ["reposts", "retweet_count"],
    ["quotes", "quote_count"],
  ] as const) {
    const value = count(metrics[xField]);
    if (value !== undefined) engagement[field] = value;
  }
  return { xPostId, views, engagement };
}

function count(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}
