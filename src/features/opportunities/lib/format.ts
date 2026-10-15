import type { Doc } from "@convex/_generated/dataModel";

type Compensation = Pick<Doc<"opportunities">, "fixedFeeCents" | "cpmRateCents">;

/** Formats integer cents as dollars, dropping ".00" for whole amounts. */
function dollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/**
 * One-line summary of an opportunity's default pay, e.g. "$300 • $5 CPM". The
 * payment cap is left out per design.
 */
export function formatCompensation({ fixedFeeCents, cpmRateCents }: Compensation): string {
  const parts: string[] = [];
  if (fixedFeeCents > 0) parts.push(dollars(fixedFeeCents));
  if (cpmRateCents > 0) parts.push(`${dollars(cpmRateCents)} CPM`);
  return parts.length > 0 ? parts.join(" • ") : "Unpaid";
}

/** Month and day of a deadline, e.g. "October 15". Defaults to the viewer's time zone. */
export function formatDeadline(deadline: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone }).format(
    deadline,
  );
}
