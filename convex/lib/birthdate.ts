import { apiError } from "./errors";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MINIMUM_AGE = 18;

/**
 * Checks a date of birth and returns it unchanged.
 *
 * Stored as UTC midnight rather than a local instant: a birthday is a calendar
 * date, and a local-midnight timestamp lands on the previous day for anyone
 * west of UTC, which would shift the age by a day at the boundary.
 *
 * @throws `invalid_state` with `invalid_date_of_birth` if it is not UTC
 * midnight or lies in the future, or `under_minimum_age` if the creator is
 * younger than 18 today.
 */
export function requireAdultBirthdate(dateOfBirth: number, now = Date.now()): number {
  if (!Number.isSafeInteger(dateOfBirth) || dateOfBirth % DAY_MS !== 0 || dateOfBirth > now) {
    throw apiError("invalid_state", { reason: "invalid_date_of_birth" });
  }
  const born = new Date(dateOfBirth);
  // The same calendar date, MINIMUM_AGE years later. Using UTC parts keeps
  // 29 February correct: it rolls to 1 March in a non-leap year.
  const eligibleAt = Date.UTC(
    born.getUTCFullYear() + MINIMUM_AGE,
    born.getUTCMonth(),
    born.getUTCDate(),
  );
  if (now < eligibleAt) {
    throw apiError("invalid_state", { reason: "under_minimum_age" });
  }
  return dateOfBirth;
}
