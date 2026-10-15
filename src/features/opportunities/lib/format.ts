import type { Doc } from "@convex/_generated/dataModel";

const DAY_MS = 86_400_000;

/** Whole dollars when there are no cents (`$600`), two decimals otherwise (`$3.50`). */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

type Terms = Pick<Doc<"opportunities">, "fixedFeeCents" | "cpmRateCents" | "paymentCapCents">;

/**
 * One line of pay terms: the fixed fee, the CPM rate (paid per 1,000 eligible
 * views), and the cap on total pay, which only matters when there's a CPM.
 */
export function formatCompensation({
  fixedFeeCents,
  cpmRateCents,
  paymentCapCents,
}: Terms): string {
  const parts = [];
  if (fixedFeeCents > 0) parts.push(formatMoney(fixedFeeCents));
  if (cpmRateCents > 0) parts.push(`${formatMoney(cpmRateCents)} CPM`);
  // "Unpaid" states the fact; "not listed" would imply the company left it out.
  if (parts.length === 0) return "Unpaid";
  const pay = parts.join(" + ");
  return cpmRateCents > 0 && paymentCapCents > 0
    ? `${pay} • Up to ${formatMoney(paymentCapCents)}`
    : pay;
}

/** `October 15`, or `October 15, 2026` with `withYear`. Uses the viewer's time zone by default. */
export function formatDeadline(
  deadline: number,
  options: { withYear?: boolean; timeZone?: string } = {},
): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: options.withYear ? "numeric" : undefined,
    timeZone: options.timeZone,
  }).format(deadline);
}

/** `3/20 spots left`: open spots out of the total. */
export function formatSpotsLeft({
  maxSlots,
  numFilledSlots,
}: Pick<Doc<"opportunities">, "maxSlots" | "numFilledSlots">): string {
  return `${Math.max(maxSlots - numFilledSlots, 0)}/${maxSlots} spots left`;
}

/** `Today`, `1 day ago`, `10 days ago`. */
export function formatPostedAgo(createdAt: number, now: number): string {
  const days = Math.floor((now - createdAt) / DAY_MS);
  if (days <= 0) return "Today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}
