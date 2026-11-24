const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const LONG_DATE = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** e.g. "Nov 10, 2026". */
export function formatShortDate(at: number): string {
  return SHORT_DATE.format(at);
}

/** e.g. "November 10, 2026". */
export function formatLongDate(at: number): string {
  return LONG_DATE.format(at);
}
