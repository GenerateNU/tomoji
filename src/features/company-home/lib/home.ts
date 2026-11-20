import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { formatCurrency } from "@/features/earnings/lib/earnings-format";
import { formatMoney } from "@/lib/money";

export type Overview = FunctionReturnType<typeof api.companyHome.overview>;
export type Offers = FunctionReturnType<typeof api.companyHome.offers>;
export type Drafts = FunctionReturnType<typeof api.companyHome.drafts>;
export type Earnings = FunctionReturnType<typeof api.companyHome.earnings>;
export type HomeDetailsState =
  | { kind: "offers" }
  | { kind: "earnings" }
  | { kind: "draft"; submissionId: Id<"submissions"> }
  | null;
const DAY = 86_400_000;

/** Monday through the next Monday, in the viewer's local timezone. */
export function homePeriod(now: number) {
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return { from: from.getTime(), to: to.getTime() };
}

/** Reuses the shared currency formatter without converting between currencies. */
export function homeMoney(amount: number, currency: string) {
  return currency === "usd" ? formatMoney(amount) : formatCurrency(amount, currency);
}

/** A short, rounded-up expiry label; an expired row never claims time remains. */
export function offerTime(expiresAt: number, now: number) {
  const remaining = expiresAt - now;
  if (remaining <= 0) return "Expired";
  const days = Math.ceil(remaining / DAY);
  const hours = Math.ceil(remaining / 3_600_000);
  if (hours >= 24) return `${days} ${days === 1 ? "day" : "days"} left`;
  return `${hours} ${hours === 1 ? "hour" : "hours"} left`;
}
