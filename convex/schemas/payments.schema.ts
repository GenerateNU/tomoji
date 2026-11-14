import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * An attempt only moves out of `processing`, never between `succeeded` and
 * `failed`: every retry is a new attempt with a new Stripe charge.
 */
export const paymentStatus = v.union(
  v.literal("processing"),
  v.literal("succeeded"),
  v.literal("failed"),
);

/**
 * One attempt to collect a payout by charging the company's card on the
 * creator's Stripe account. A payout can take several attempts, for example a
 * declined card and then a replacement, so attempts live here and the payout
 * keeps only the summary `paymentStatus`. The charge is always the payout's
 * `amount` in its currency.
 */
export const paymentsTable = defineTable({
  payoutId: v.id("payouts"),
  // 1 for the first try. Part of the idempotency key, so an attempt can never
  // charge twice while a retry gets a fresh charge.
  attempt: v.number(),
  // The creator's account the charge is made on, where its fee is recorded.
  stripeAccountId: v.string(),
  // The company card this attempt charges, saved when it starts. Resuming the
  // attempt resends with this card, never one swapped in since, so its
  // idempotency key always carries the same request. Absent on attempts that
  // never reached Stripe, such as a payout blocked before charging.
  paymentMethodId: v.optional(v.string()),
  // Absent until Stripe creates the charge. Webhooks find the attempt through
  // the charge's `metadata.paymentId`, since they can arrive before this is saved.
  stripePaymentIntentId: v.optional(v.string()),
  status: paymentStatus,
  // Stripe's reason for a failure, such as `card_declined` or `insufficient_funds`.
  failureCode: v.optional(v.string()),
  // Stripe's fee and what the creator keeps, in minor units of
  // `settlementCurrency`. Stripe attaches them a few seconds after the charge
  // succeeds. The payout's earned `amount` is never rewritten to match.
  stripeFee: v.optional(v.number()),
  creatorNet: v.optional(v.number()),
  // The creator account's currency, such as `usd` or `cad`. A creator outside
  // the US is paid in their own currency after Stripe converts the USD charge.
  settlementCurrency: v.optional(v.string()),
  // When recovery last asked about this attempt, or when it started. Absent on
  // attempts recorded before recovery tracked it, which are checked first.
  lastCheckedAt: v.optional(v.number()),
})
  .index("by_payoutId_and_attempt", ["payoutId", "attempt"])
  // Recovery checks attempts left `processing`, least recently checked first,
  // so ones that never settle can't keep newer stalls from being checked.
  .index("by_status_and_lastCheckedAt", ["status", "lastCheckedAt"]);
