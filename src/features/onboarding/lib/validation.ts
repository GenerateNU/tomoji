/**
 * Field checks for the onboarding forms. Each returns the message to show
 * under the field, or null when it passes. The messages are the ones in the
 * designs; the server checks the same rules again on save.
 */

import { findDuplicateLink } from "@convex/lib/links";

/** Unix ms at UTC midnight for a `MM/DD/YYYY` date, or null if it isn't one. */
export function parseBirthdate(value: string): number | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (match === null) return null;
  const [, month, day, year] = match.map(Number);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  // Rejects impossible dates like 02/31/2000, which Date.UTC would roll over.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

export function birthdateError(value: string): string | null {
  return parseBirthdate(value) === null ? "Enter your date of birth as MM/DD/YYYY" : null;
}

export function requiredError(value: string, message: string): string | null {
  return value.trim() === "" ? message : null;
}

export function selectionError(values: string[], message: string): string | null {
  return values.length === 0 ? message : null;
}

/**
 * A link the profile can show. Accepts what people actually type, so
 * `zahra.design` passes and is stored as `https://zahra.design`.
 */
export function normalizeLink(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  // A bare word parses as a hostname, so require a dot and no spaces.
  if (!url.hostname.includes(".") || /\s/.test(trimmed)) return null;
  return url.toString();
}

export function linkError(value: string, message = "Enter a valid URL"): string | null {
  if (value.trim() === "") return null;
  return normalizeLink(value) === null ? message : null;
}

/**
 * Per-row messages for the extra links, keyed by row. Blank rows are skipped
 * rather than reported; a repeat is marked on its later row. `otherLinks` are
 * the GitHub and LinkedIn fields as typed, which an extra link may not repeat.
 */
export function additionalLinkErrors(
  links: string[],
  otherLinks: readonly string[] = [],
): Record<number, string> {
  const errors: Record<number, string> = {};
  links.forEach((value, index) => {
    const message = linkError(value);
    if (message !== null) errors[index] = message;
  });
  const duplicate = duplicateLinkRow(links, otherLinks);
  if (duplicate !== null) errors[duplicate] = DUPLICATE_LINK_ERROR;
  return errors;
}

export const DUPLICATE_LINK_ERROR = "You've already added this link.";

/**
 * The row whose link repeats an earlier row or the GitHub/LinkedIn field, or
 * null. Blank and invalid rows are skipped, so this can run on every render
 * and flag a duplicate before the creator tries to continue.
 */
export function duplicateLinkRow(
  links: string[],
  otherLinks: readonly string[] = [],
): number | null {
  return findDuplicateLink(
    links.map((link) => normalizeLink(link) ?? ""),
    otherLinks.map((link) => normalizeLink(link)),
  );
}
