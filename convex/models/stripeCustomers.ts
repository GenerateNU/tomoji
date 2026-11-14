import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { savedCard } from "../schemas/stripeCustomers.schema";
import { requireCompany } from "./companies";

/**
 * Whether approved payouts can be charged to the company: `missing` until a
 * company admin saves a card through Checkout, then `ready` with the card to
 * display, or `expired` once that card is past its expiry and needs replacing.
 * Stripe's payment method id stays on the server.
 */
export const paymentMethodStatus = v.object({
  status: v.union(v.literal("missing"), v.literal("ready"), v.literal("expired")),
  card: v.union(
    v.object({ brand: v.string(), last4: v.string(), expMonth: v.number(), expYear: v.number() }),
    v.null(),
  ),
});

/** The customer Stripe just created for a company, and when (Unix ms, Stripe's clock). */
export const stripeCustomerState = v.object({
  stripeCustomerId: v.string(),
  stripeUpdatedAt: v.number(),
});

/** A card saved through Checkout, and when Stripe saved it (Unix ms, Stripe's clock). */
export const savedPaymentMethod = v.object({
  stripeCustomerId: v.string(),
  card: savedCard,
  stripeUpdatedAt: v.number(),
});

export type PaymentMethodStatus = Infer<typeof paymentMethodStatus>;
export type StripeCustomerState = Infer<typeof stripeCustomerState>;
export type SavedPaymentMethod = Infer<typeof savedPaymentMethod>;

export async function getStripeCustomerByCompanyId(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">,
): Promise<Doc<"stripeCustomers"> | null> {
  return await ctx.db
    .query("stripeCustomers")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .unique();
}

export async function getStripeCustomerByStripeId(
  ctx: QueryCtx | MutationCtx,
  stripeCustomerId: string,
): Promise<Doc<"stripeCustomers"> | null> {
  return await ctx.db
    .query("stripeCustomers")
    .withIndex("by_stripeCustomerId", (q) => q.eq("stripeCustomerId", stripeCustomerId))
    .unique();
}

/**
 * Whether a card is past its expiry at `now` (Unix ms). Cards work through the
 * last day of their expiry month; UTC decides the month, which can differ from
 * the cardholder's by a day at the turn of a month.
 */
export function isCardExpired(card: { expMonth: number; expYear: number }, now: number): boolean {
  const today = new Date(now);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  return card.expYear < year || (card.expYear === year && card.expMonth < month);
}

export function toPaymentMethodStatus(
  customer: Doc<"stripeCustomers"> | null,
  now: number,
): PaymentMethodStatus {
  if (customer?.card === undefined) return { status: "missing", card: null };
  const { brand, last4, expMonth, expYear } = customer.card;
  return {
    // An expired card would only be declined; the company needs to replace it.
    status: isCardExpired(customer.card, now) ? "expired" : "ready",
    card: { brand, last4, expMonth, expYear },
  };
}

/**
 * Records the customer Stripe just created for a company. The index cannot
 * enforce one row per company, so the read and insert share this transaction.
 * Saving the same customer again returns the existing row: concurrent setup
 * requests share an idempotency key and receive the same customer.
 *
 * @throws `not_found` if the company no longer exists.
 * @throws `conflict` with reason `stripe_customer_exists` if the company
 * already has a different Stripe customer.
 */
export async function createStripeCustomer(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  state: StripeCustomerState,
): Promise<Doc<"stripeCustomers">> {
  await requireCompany(ctx, companyId);
  const existing = await getStripeCustomerByCompanyId(ctx, companyId);
  if (existing !== null) {
    if (existing.stripeCustomerId === state.stripeCustomerId) return existing;
    throw apiError("conflict", { reason: "stripe_customer_exists" });
  }
  const id = await ctx.db.insert("stripeCustomers", { companyId, ...state });
  const customer = await ctx.db.get("stripeCustomers", id);
  if (customer === null) throw new Error("inserted Stripe customer vanished");
  return customer;
}

/**
 * Saves the card from a completed Checkout session, replacing any earlier one.
 * Stripe delivers events out of order, so a card older than the stored one is
 * skipped; equal timestamps apply, because Stripe's clock has one-second
 * resolution. `unknown` means another deployment sharing the Stripe sandbox
 * made the customer. There is nothing to adopt: Checkout only opens after the
 * customer is saved.
 */
export async function savePaymentMethod(
  ctx: MutationCtx,
  saved: SavedPaymentMethod,
): Promise<"updated" | "stale" | "unknown"> {
  const customer = await getStripeCustomerByStripeId(ctx, saved.stripeCustomerId);
  if (customer === null) return "unknown";
  if (saved.stripeUpdatedAt < customer.stripeUpdatedAt) return "stale";
  await ctx.db.patch("stripeCustomers", customer._id, {
    card: saved.card,
    stripeUpdatedAt: saved.stripeUpdatedAt,
  });
  return "updated";
}

/**
 * Applies new card details the card network sent for the company's current
 * card, such as a renewed expiry. Stripe keeps updating cards a company has
 * since replaced, so only the current card changes; anything else is `replaced`.
 */
export async function refreshCard(
  ctx: MutationCtx,
  saved: SavedPaymentMethod,
): Promise<"updated" | "replaced" | "unknown"> {
  const customer = await getStripeCustomerByStripeId(ctx, saved.stripeCustomerId);
  if (customer === null) return "unknown";
  if (customer.card?.paymentMethodId !== saved.card.paymentMethodId) return "replaced";
  // Only the card's details change, never `stripeUpdatedAt`, which orders the
  // company's choice of card: a renewal stamped after a new card's Checkout
  // would otherwise make that new card look stale. The webhook reads these
  // details from Stripe as they are now, so they need no ordering of their own.
  await ctx.db.patch("stripeCustomers", customer._id, { card: saved.card });
  return "updated";
}
