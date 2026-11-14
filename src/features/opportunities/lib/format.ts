import type { Doc } from "@convex/_generated/dataModel";

import { formatMoney } from "@/lib/money";

export { formatCompensation, formatMoney } from "@/lib/money";

const DAY_MS = 86_400_000;

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

/**
 * `$300 + $2.50 CPM`: the pay a card leads with, without the cap. The list
 * view joins with ` • ` instead.
 */
export function formatPay(
  { fixedFeeCents, cpmRateCents }: Pick<Doc<"opportunities">, "fixedFeeCents" | "cpmRateCents">,
  separator = " + ",
): string {
  const parts: string[] = [];
  if (fixedFeeCents > 0) parts.push(formatMoney(fixedFeeCents));
  if (cpmRateCents > 0) parts.push(`${formatMoney(cpmRateCents)} CPM`);
  return parts.length === 0 ? "Unpaid" : parts.join(separator);
}
