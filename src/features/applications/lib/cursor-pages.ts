/**
 * Numbered pages over a cursor-paginated Convex query. Convex returns a cursor
 * for the page after the current one but no total, so pages are discovered by
 * moving forward, and `cursors[i]` is what fetches page `i + 1`.
 */
export type CursorPages = { cursors: (string | null)[]; index: number };

export const FIRST_PAGE: CursorPages = { cursors: [null], index: 0 };

/** Moves to the next page, recording its cursor the first time it's reached. */
export function nextPage(pages: CursorPages, continueCursor: string): CursorPages {
  const index = pages.index + 1;
  if (index < pages.cursors.length) return { ...pages, index };
  return { cursors: [...pages.cursors, continueCursor], index };
}

export function previousPage(pages: CursorPages): CursorPages {
  return pages.index === 0 ? pages : { ...pages, index: pages.index - 1 };
}
