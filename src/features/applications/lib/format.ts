export { formatCompensation } from "@/lib/money";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const relative = new Intl.RelativeTimeFormat("en", { numeric: "always" });

/** "10 days ago" or "in 5 days", in the largest unit that fits. */
export function formatRelativeTime(timestamp: number, now: number): string {
  const diff = timestamp - now;
  const abs = Math.abs(diff);
  if (abs < MINUTE) return "just now";
  const [unit, size]: [Intl.RelativeTimeFormatUnit, number] =
    abs < HOUR
      ? ["minute", MINUTE]
      : abs < DAY
        ? ["hour", HOUR]
        : abs < MONTH
          ? ["day", DAY]
          : abs < YEAR
            ? ["month", MONTH]
            : ["year", YEAR];
  return relative.format(Math.trunc(diff / size), unit);
}

/** "November 16", or "November 16, 2:30 PM" with `withTime`, in the viewer's time zone. */
export function formatOfferDeadline(timestamp: number, { withTime = false } = {}): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(timestamp);
}
