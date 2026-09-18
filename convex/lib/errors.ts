import { ConvexError, type Value } from "convex/values";

export const ERROR_MESSAGES = {
  not_authenticated: "Not authenticated",
  not_synced: "Account setup incomplete",
  account_deactivated: "Account deactivated",
  forbidden: "Forbidden",
  not_found: "Not found",
  conflict: "Conflict",
  invalid_state: "Invalid state",
  misconfigured: "Server misconfiguration",
  upstream_failure: "Upstream service failed",
} as const;

export type ApiErrorCode = keyof typeof ERROR_MESSAGES;

export type ApiErrorData = {
  code: ApiErrorCode;
  message: string;
  [key: string]: Value;
};

export function apiError(
  code: ApiErrorCode,
  detail: Record<string, Value> = {},
): ConvexError<ApiErrorData> {
  return new ConvexError({ code, message: ERROR_MESSAGES[code], ...detail });
}
