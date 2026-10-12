import { apiError } from "./errors";

export const HALF_HOUR_MS = 30 * 60 * 1000;

/** Checks exact UTC :00/:30 alignment; domain callers decide whether a time may be past or omitted. */
export function isHalfHourTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value % HALF_HOUR_MS === 0;
}

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
