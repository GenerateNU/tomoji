"use client";

import { usePaginatedQuery, type PaginatedQueryReference } from "convex/react";
import { useState } from "react";

/**
 * `usePaginatedQuery`, but while new arguments load their first page it keeps
 * returning the last loaded results, so changing a filter doesn't flash a
 * loading state. `isStale` is true while those older results are showing.
 * The paginated counterpart of `useStableQuery`.
 */
export function useStablePaginatedQuery<Query extends PaginatedQueryReference>(
  ...[query, args, options]: Parameters<typeof usePaginatedQuery<Query>>
) {
  const result = usePaginatedQuery(query, args, options);
  const loaded = result.status !== "LoadingFirstPage";
  // Same render-time update as useStableQuery; Convex memoizes `results`, so it settles.
  const [last, setLast] = useState(loaded ? result.results : undefined);
  if (loaded && result.results !== last) setLast(result.results);
  const isStale = !loaded && last !== undefined;
  return { ...result, results: isStale ? last : result.results, isStale };
}
