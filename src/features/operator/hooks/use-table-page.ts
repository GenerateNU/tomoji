"use client";

import { useState } from "react";
import type { PaginationStatus } from "convex/react";

/** The parts of `usePaginatedQuery`'s result this hook needs. */
type Paginated<Row> = {
  results: readonly Row[];
  status: PaginationStatus;
  loadMore: (numItems: number) => void;
};

export type TablePage<T> = {
  rows: T[];
  pageIndex: number;
  /** The first page is still loading, or the current page is only partly fetched. */
  loading: boolean;
  /** Nothing matched, and we are done looking. */
  empty: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  previous: () => void;
  next: () => void;
};

/**
 * Fixed-size pages over a Convex paginated query. Convex hands back one growing
 * list, so pages are sliced out of it and the next chunk is only requested when
 * the reader actually walks off the end.
 *
 * `resetKey` is the filter state the results belong to: when it changes, Convex
 * starts a new query and the page index goes back to the top with it.
 */
export function useTablePage<Row>(
  { results, status, loadMore }: Paginated<Row>,
  pageSize: number,
  resetKey: string,
): TablePage<Row> {
  const [page, setPage] = useState({ key: resetKey, index: 0 });
  const pageIndex = page.key === resetKey ? page.index : 0;

  const start = pageIndex * pageSize;
  const rows = results.slice(start, start + pageSize);
  const fetching = status === "LoadingFirstPage" || status === "LoadingMore";
  const loading = status === "LoadingFirstPage" || (fetching && rows.length < pageSize);

  return {
    rows,
    pageIndex,
    loading,
    empty: !fetching && results.length === 0,
    hasPrevious: pageIndex > 0,
    hasNext: results.length > start + pageSize || status === "CanLoadMore",
    previous: () => setPage({ key: resetKey, index: Math.max(0, pageIndex - 1) }),
    next: () => {
      // Fetch the following chunk only when it isn't already in hand.
      if (results.length < start + 2 * pageSize && status === "CanLoadMore") loadMore(pageSize);
      setPage({ key: resetKey, index: pageIndex + 1 });
    },
  };
}
