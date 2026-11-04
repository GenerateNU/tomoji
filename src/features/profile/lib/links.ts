import { MAX_ADDITIONAL_LINKS } from "@convex/schemas/creators.schema";

type LinkResult = { ok: true; value: string | null } | { ok: false; error: string };
type LinksResult =
  | { ok: true; value: string[] }
  | { ok: false; error: string; index: number | null };

/** Normalizes one https URL the way `requireAdditionalLinks` stores it. */
function parseHttpsUrl(input: string): URL | null {
  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

export function parseLinkedinLink(input: string): LinkResult {
  const value = input.trim();
  if (!value) return { ok: true, value: null };

  const url = parseHttpsUrl(/^(www\.)?linkedin\.com\//i.test(value) ? `https://${value}` : value);
  if (
    url !== null &&
    /^([a-z0-9-]+\.)*linkedin\.com$/i.test(url.hostname) &&
    url.pathname !== "/"
  ) {
    // Kept as typed rather than url.href, so a pasted profile URL is unchanged.
    return { ok: true, value: url.href.replace(/\/$/, "") };
  }
  return { ok: false, error: "Enter a LinkedIn URL, such as https://linkedin.com/in/username." };
}

/**
 * Validates the whole set at once. `index` points at the row to mark, or null
 * when the problem is the number of links rather than one of them.
 */
export function parseAdditionalLinks(inputs: string[]): LinksResult {
  const entered = inputs
    .map((input, index) => ({ value: input.trim(), index }))
    .filter((entry) => entry.value !== "");
  if (entered.length > MAX_ADDITIONAL_LINKS) {
    return {
      ok: false,
      error: `Add up to ${MAX_ADDITIONAL_LINKS} links.`,
      index: null,
    };
  }

  const links: string[] = [];
  for (const entry of entered) {
    const url = parseHttpsUrl(entry.value);
    if (url === null) {
      return {
        ok: false,
        error: "Enter a secure URL, such as https://example.com.",
        index: entry.index,
      };
    }
    links.push(url.href);
  }
  return { ok: true, value: links };
}
