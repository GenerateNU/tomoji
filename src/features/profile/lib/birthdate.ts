import { MINIMUM_AGE } from "@convex/lib/birthdate";

type BirthdateResult = { ok: true; value: number | null } | { ok: false; error: string };

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Converts the `YYYY-MM-DD` value of a date input into the UTC-midnight
 * timestamp the API stores, applying the same age rule so the user hears about
 * it before submitting. The backend check in `convex/lib/birthdate.ts` is the
 * one that counts.
 */
export function parseBirthdate(input: string, now = Date.now()): BirthdateResult {
  const value = input.trim();
  if (!value) return { ok: true, value: null };

  const parts = DATE_INPUT.exec(value);
  if (parts === null) return { ok: false, error: "Enter your date of birth." };
  const [year, month, day] = parts.slice(1).map(Number) as [number, number, number];
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  // Date.UTC rolls 31 February over into March rather than rejecting it.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { ok: false, error: "Enter your date of birth." };
  }
  if (timestamp > now) {
    return { ok: false, error: "Your date of birth can't be in the future." };
  }
  if (now < Date.UTC(year + MINIMUM_AGE, month - 1, day)) {
    return { ok: false, error: `You must be at least ${MINIMUM_AGE} to use Tomoji.` };
  }
  return { ok: true, value: timestamp };
}

/** The stored birthdate as a date input expects it. */
export function toDateInputValue(dateOfBirth?: number): string {
  if (dateOfBirth === undefined) return "";
  return new Date(dateOfBirth).toISOString().slice(0, 10);
}

/** The stored birthdate for display, read in UTC so it shows the stored day. */
export function formatBirthdate(dateOfBirth?: number): string | undefined {
  if (dateOfBirth === undefined) return undefined;
  return new Date(dateOfBirth).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
