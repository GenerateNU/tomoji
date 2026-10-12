import { ConvexError } from "convex/values";
import type { ApiErrorCode } from "@convex/lib/errors";

/**
 * Last-resort generic messages. Callers should pass their own messages
 * if necessary to provide user-facing information.
 */
const MESSAGES: Record<ApiErrorCode, string> = {
  not_authenticated: "Your session is expired. Please sign in again.",
  not_synced: "Your account is still being set up. Try again in a moment.",
  account_deactivated: "This account has been deactivated.",
  forbidden: "You don't have permission to perform this action.",
  not_found: "We couldn't find what you were looking for.",
  conflict: "This action conflicts with an existing record. Please check and try again.",
  invalid_state: "This action isn't available right now.",
  misconfigured: "Something went wrong. Try again.",
  upstream_failure: "Something went wrong. Try again.",
};

/** The error code, or null if it didn't come from our backend. */
export function errorCode(error: unknown): ApiErrorCode | null {
  if (!(error instanceof ConvexError)) return null;
  const code = (error.data as { code?: unknown } | null)?.code;
  return typeof code === "string" && code in MESSAGES ? (code as ApiErrorCode) : null;
}

/**
 * Copy to show the user. Pass `overrides` for codes where you know the
 * situation — `errorMessage(e, { conflict: "You've already applied." })`.
 */
export function errorMessage(
  error: unknown,
  overrides: Partial<Record<ApiErrorCode, string>> = {},
): string {
  const code = errorCode(error);
  if (code === null) return "Something went wrong. Try again.";
  return overrides[code] ?? MESSAGES[code];
}
