import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  attachPaymentIntent,
  recordPaymentFailed,
  recordPaymentFee,
  recordPaymentSucceeded,
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
