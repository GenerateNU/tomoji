/**
 * An amount in a currency's minor units, e.g. `formatCurrency(94_100, "cad")`
 * is "CA$941.00". Payouts are in USD, but a creator outside the US is paid in
 * their own currency, so Stripe's fee and their net can be in another one.
 */
export function formatCurrency(minorUnits: number, currency: string): string {
  const format = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(minorUnits / 10 ** digits);
}

const DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" });
const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** e.g. "November 11, 2026". */
export function formatDate(at: number): string {
  return DATE.format(at);
}

/**
 * An earning period as "October 31 – November 6, 2026", or "Oct 31 – Nov 6, 2026"
 * when `short`. A weekly period ends at the next one's start, so the last day
 * shown is the one just before `endsAt`.
 */
export function formatPeriod(period: { startsAt: number; endsAt: number }, short = false): string {
  return (short ? SHORT_DATE : DATE).formatRange(period.startsAt, period.endsAt - 1);
}
