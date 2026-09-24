import { apiError } from "./errors";

/**
 * Returns `value` trimmed
 * @throws `invalid_state` with reason `<field>_blank` if nothing is left after
 * trimming.
 */
export function requireNonBlank(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw apiError("invalid_state", { reason: `${field}_blank` });
  }
  return trimmed;
}
