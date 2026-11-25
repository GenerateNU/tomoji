/**
 * Comparison key for a link.
 */
function linkKey(link: string): string {
  return new URL(link).href.replace(/\/+$/, "");
}

/**
 * Position of the first link that repeats an earlier one, or null.
 */
export function findDuplicateLink(links: readonly string[]): number | null {
  const seen = new Set<string>();
  for (const [index, link] of links.entries()) {
    const key = linkKey(link);
    if (seen.has(key)) return index;
    seen.add(key);
  }
  return null;
}
