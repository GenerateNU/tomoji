import { apiError } from "./errors";

/**
 * Returns `value` trimmed.
 * @throws `invalid_state` with reason `<field>_blank` if nothing is left after
 * trimming, or `<field>_too_long` if it's longer than `maxLength`.
 */
export function requireNonBlank(value: string, field: string, maxLength?: number): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw apiError("invalid_state", { reason: `${field}_blank` });
  }
  if (maxLength !== undefined && trimmed.length > maxLength) {
    throw apiError("invalid_state", { reason: `${field}_too_long` });
  }
  return trimmed;
}
