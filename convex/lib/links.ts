/**
 * Comparison key for a link: `URL.href` lowercases the host, and a trailing
 * `/` is dropped, so `https://Example.com/` and `https://example.com` match.
 * Null when the value is not a URL.
 */
function linkKey(link: string): string | null {
  try {
    return new URL(link).href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/**
 * Position of the first link that repeats an earlier one, or one of the
 * profile's other links (GitHub, LinkedIn), or null. Entries in either list
 * that are blank or not URLs (a row still being typed, an older saved value)
 * are skipped, and positions still refer to the original `links`.
 */
export function findDuplicateLink(
  links: readonly string[],
  otherLinks: readonly (string | null | undefined)[] = [],
): number | null {
  const seen = new Set<string>();
  for (const link of otherLinks) {
    const key = link ? linkKey(link) : null;
    if (key !== null) seen.add(key);
  }
  for (const [index, link] of links.entries()) {
    const key = linkKey(link);
    if (key === null) continue;
    if (seen.has(key)) return index;
    seen.add(key);
  }
  return null;
}
