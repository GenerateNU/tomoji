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

/** Like `requireNonBlank`, but also rejects text longer than `maxLength` with `<field>_too_long`. */
export function requireBoundedText(value: string, field: string, maxLength: number): string {
  const trimmed = requireNonBlank(value, field);
  if (trimmed.length > maxLength) {
    throw apiError("invalid_state", { reason: `${field}_too_long` });
  }
  return trimmed;
}
