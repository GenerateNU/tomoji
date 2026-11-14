import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { companyAdminMutation } from "./lib/functions";
import {
  attachPaymentIntent,
  recordPaymentFailed,
  recordPaymentFee,
  recordPaymentSucceeded,
  retryCompanyPayout,
  startPayment,
} from "./models/payments";
import schema from "./schema";

/**
 * Database steps for collecting payouts: the charging action starts an attempt
 * and saves Stripe's charge id, and the Stripe webhook records the outcome.
 * Neither can write the database itself. Outcomes come from verified Stripe
 * events, never from a client.
 */

const outcome = v.union(v.literal("updated"), v.literal("unchanged"), v.literal("unknown"));

/**
 * Sends one of the company's payouts that needs attention back to be charged,
 * for an admin who has fixed the problem, for example with their bank. The
 * next charging run makes a new attempt.
 *
 * @throws `forbidden` with reason `company_admin_required` for a member.
 * @throws `not_found` if the payout is missing or another company's.
 * @throws `invalid_state` with reason `payout_not_retryable` unless it needs attention.
 */
export const retry = companyAdminMutation({
  args: { payoutId: v.id("payouts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await retryCompanyPayout(ctx, ctx.membership.companyId, args.payoutId);
    return null;
  },
});

/** Starts the next attempt for an approved payout. See `startPayment`. */
export const start = internalMutation({
  args: { payoutId: v.id("payouts"), stripeAccountId: v.string() },
  returns: schema.doc("payments"),
  handler: async (ctx, args) => await startPayment(ctx, args.payoutId, args.stripeAccountId),
});

/** Saves the charge Stripe created for an attempt. */
export const attachIntent = internalMutation({
  args: { paymentId: v.id("payments"), stripePaymentIntentId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await attachPaymentIntent(ctx, args.paymentId, args.stripePaymentIntentId);
    return null;
  },
});

/** Applies `payment_intent.succeeded`. See `recordPaymentSucceeded`. */
export const recordSucceeded = internalMutation({
  args: {
    paymentId: v.string(),
    stripeAccountId: v.string(),
    stripePaymentIntentId: v.string(),
    succeededAt: v.number(),
  },
  returns: outcome,
  handler: async (ctx, args) => await recordPaymentSucceeded(ctx, args),
});

/** Applies `payment_intent.payment_failed`. See `recordPaymentFailed`. */
export const recordFailed = internalMutation({
  args: {
    paymentId: v.string(),
    stripeAccountId: v.string(),
    stripePaymentIntentId: v.string(),
    failureCode: v.string(),
  },
  returns: outcome,
  handler: async (ctx, args) => await recordPaymentFailed(ctx, args),
});

/** Records the fee Stripe attached to a charge. See `recordPaymentFee`. */
export const recordFee = internalMutation({
  args: {
    paymentId: v.string(),
    stripeAccountId: v.string(),
    stripeFee: v.number(),
    creatorNet: v.number(),
    settlementCurrency: v.string(),
  },
  returns: outcome,
  handler: async (ctx, args) => await recordPaymentFee(ctx, args),
});
