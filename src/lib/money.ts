import type { Doc } from "@convex/_generated/dataModel";

/** Dollars from integer cents, dropping ".00" for whole amounts. */
export function formatMoney(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** The pay terms an opportunity offers. */
export type Compensation = Pick<
  Doc<"opportunities">,
  "fixedFeeCents" | "cpmRateCents" | "paymentCapCents"
>;

/**
 * Pay as one line. The full form is `$300 + $5.50 CPM (up to $2,000)`: CPM is
 * per 1,000 eligible views, and the cap limits the total payout, so it only
 * means anything alongside a CPM. The compact form, for table cells, is
 * `$300 • $5.50 CPM` with no cap.
 *
 * Shared because a creator reads the same terms in the opportunity feed and
 * again in their applications list, and those used to disagree: one rendered
 * the cap after a bullet and called zero pay "Unpaid", the other parenthesised
 * the cap and showed an em dash.
 */
export function formatCompensation(
  { fixedFeeCents, cpmRateCents, paymentCapCents }: Compensation,
  { variant = "full" }: { variant?: "full" | "compact" } = {},
): string {
  const parts: string[] = [];
  if (fixedFeeCents > 0) parts.push(formatMoney(fixedFeeCents));
  if (cpmRateCents > 0) parts.push(`${formatMoney(cpmRateCents)} CPM`);
  // Zero pay is a fact worth stating; a dash reads as missing data.
  if (parts.length === 0) return "Unpaid";
  if (variant === "compact") return parts.join(" \u2022 ");
  const pay = parts.join(" + ");
  return cpmRateCents > 0 && paymentCapCents > 0
    ? `${pay} (up to ${formatMoney(paymentCapCents)})`
    : pay;
}
