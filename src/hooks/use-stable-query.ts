"use client";

import { useQuery } from "convex/react";
import type { FunctionReference } from "convex/server";
import { useState } from "react";

/**
 * `useQuery`, but while new arguments load it keeps returning the last result
 * instead of `undefined`, so changing a filter doesn't flash a loading state.
 * `isStale` is true while that older result is showing.
 */
export function useStableQuery<Query extends FunctionReference<"query">>(
  query: Query,
  args: Query["_args"],
): { data: Query["_returnType"] | undefined; isStale: boolean } {
  const result = useQuery(query, args);
  // Remembers the last loaded result. Updating state during render is React's
  // pattern for this; Convex returns the same object until the data changes,
  // so it settles after one update.
  const [last, setLast] = useState(result);
  if (result !== undefined && result !== last) setLast(result);
  return { data: result ?? last, isStale: result === undefined && last !== undefined };
}
