const COMPACT_USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
const AXIS_DATE = new Intl.DateTimeFormat("en-US", { month: "numeric", day: "numeric" });
const POINT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export type EarningsSeries = {
  /** Running total in cents at the end of each local day, from the first day to today. */
  values: number[];
  labels: string[];
  pointLabels: string[];
  yLabels: string[];
  max: number;
};

/**
 * Earnings as a running total per local day, for the line chart. Starts at
 * `from`, or the first earning for all time, and always has at least two days
 * so a line can be drawn.
 */
export function earningsSeries(
  earnings: { at: number; amount: number }[],
  from: number | null,
  now: Date,
): EarningsSeries {
  const today = startOfDay(now);
  const first = from ?? earnings[0]?.at ?? today.getTime();
  let start = startOfDay(new Date(first));
  if (start.getTime() >= today.getTime()) start = addDays(today, -1);

  const values: number[] = [];
  const labels: string[] = [];
  const pointLabels: string[] = [];
  let total = 0;
  let next = 0;
  for (let day = start; day.getTime() <= today.getTime(); day = addDays(day, 1)) {
    const end = addDays(day, 1).getTime();
    // Earnings come oldest first, so each day picks up where the last stopped.
    while (next < earnings.length && earnings[next].at < end) total += earnings[next++].amount;
    values.push(total);
    labels.push("");
    pointLabels.push(POINT_DATE.format(day));
  }
  labels[0] = AXIS_DATE.format(start);
  labels[labels.length - 1] = "Today";

  const max = niceMax(total);
  return { values, labels, pointLabels, yLabels: [max, max / 2, 0].map(formatAxis), max };
}

/** A round top for the y axis just above `cents`, e.g. $59.20 becomes $60. */
function niceMax(cents: number): number {
  if (cents <= 0) return 1_000;
  const step = 10 ** Math.floor(Math.log10(cents)) / 2;
  return Math.ceil(cents / step) * step;
}

function formatAxis(cents: number): string {
  return COMPACT_USD.format(cents / 100);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Built from calendar parts rather than adding 24 hours, so daylight saving can't skip a day.
function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}
