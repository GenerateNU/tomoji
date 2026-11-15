export type EarningsRange = "week" | "month" | "all";

export const RANGE_OPTIONS: { value: EarningsRange; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "all", label: "All time" },
];

/** How the caption under the total names the range, e.g. "Total earnings this month". */
export const RANGE_CAPTIONS: Record<EarningsRange, string> = {
  week: "this week",
  month: "this month",
  all: "all time",
};

/**
 * Local start times for `payouts.summary`, since "this month" depends on the
 * creator's timezone. The previous period ends where this one starts, for the
 * percentage change. Weeks start on Sunday.
 */
export function rangeStarts(
  range: EarningsRange,
  now: Date,
): { from: number | null; previousFrom: number | null } {
  if (range === "all") return { from: null, previousFrom: null };
  if (range === "month") {
    return {
      from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
      previousFrom: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
    };
  }
  const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  return {
    from: sunday.getTime(),
    previousFrom: new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() - 7).getTime(),
  };
}

/** The change from `previous` to `current` in percent, or null when there's nothing to compare. */
export function percentChange(current: number, previous: number | null): number | null {
  if (previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function formatPercent(value: number): string {
  return `${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}
