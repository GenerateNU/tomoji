"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useState } from "react";
import { rangeStarts, type EarningsRange } from "../lib/earnings-range";

/**
 * `payouts.summary` for a range, through the app's query cache like the other
 * pages, so returning to the page or to a range already seen shows it at once.
 * While a new range loads, the last result stays on screen (`isStale`) rather
 * than flashing a skeleton.
 */
export function useCachedSummary(range: EarningsRange, now: Date) {
  const starts = rangeStarts(range, now);
  const result = useQuery(api.payouts.summary, starts);
  // Updating state during render keeps the last result; the cache returns the
  // same object until the data changes, so it settles after one update.
  const [last, setLast] = useState(result);
  if (result !== undefined && result !== last) setLast(result);
  return { summary: result ?? last, isStale: result === undefined && last !== undefined, starts };
}
