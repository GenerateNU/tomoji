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
