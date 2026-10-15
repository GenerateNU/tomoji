import type { Doc } from "@convex/_generated/dataModel";

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

/** Dollars from integer cents, without ".00" for whole amounts. */
function formatCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

type Terms = Pick<Doc<"opportunities">, "fixedFeeCents" | "cpmRateCents" | "paymentCapCents">;

/**
 * Pay as a short summary, e.g. "$100 + $5 CPM (up to $250)". CPM is per 1,000
 * eligible views and the cap limits the total payout.
 */
export function formatCompensation(terms: Terms): string {
  const parts: string[] = [];
  if (terms.fixedFeeCents > 0) parts.push(formatCents(terms.fixedFeeCents));
  if (terms.cpmRateCents > 0) parts.push(`${formatCents(terms.cpmRateCents)} CPM`);
  if (parts.length === 0) return "—";
  const summary = parts.join(" + ");
  return terms.cpmRateCents > 0 && terms.paymentCapCents > 0
    ? `${summary} (up to ${formatCents(terms.paymentCapCents)})`
    : summary;
}

/**
 * The next deadline that matters to the creator: how long they have to answer
 * an offer, or until a pending application's opportunity closes. Finished
 * applications have none.
 */
export function applicationExpiresAt(
  application: Pick<Doc<"applications">, "status" | "offerExpiresAt">,
  opportunityDeadline: number | undefined,
): number | null {
  switch (application.status) {
    case "offered":
      return application.offerExpiresAt ?? null;
    case "pending":
      return opportunityDeadline ?? null;
    default:
      return null;
  }
}
