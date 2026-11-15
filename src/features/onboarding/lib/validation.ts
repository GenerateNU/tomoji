/**
 * Field checks for the onboarding forms. Each returns the message to show
 * under the field, or null when it passes. The messages are the ones in the
 * designs; the server checks the same rules again on save.
 */

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
