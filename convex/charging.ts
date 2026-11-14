import { v } from "convex/values";
import { internal } from "./_generated/api";
import { env, internalAction, internalMutation, internalQuery } from "./_generated/server";
import {
  chargeConnectAccount,
  isAccountAccessLost,
  stripeClient,
  stripeErrorDetails,
} from "./lib/stripe";
import { claimDuePayouts, getChargeAccountId, prepareCharge } from "./models/payments";
import schema from "./schema";

/**
 * Collects approved payouts by charging the company's saved card on the
 * creator's Stripe account, with no one present. A cron claims due payouts and
 * schedules one charge each; the charge records its outcome straight from
 * Stripe's response, and the Connect webhook confirms it (see `payments.ts`).
 * Payouts that cannot be charged now are recorded with the reason and need
 * attention instead of being retried here.
 */

// Payouts claimed per run. Each schedules its own charge, so a run stays small;
// a full batch continues straight away.
const CHARGE_BATCH_SIZE = 25;

// A charge whose outcome is unknown, such as after a network error, is retried
// with the same attempt and idempotency key, so it can never charge twice.
const CHARGE_RETRY_DELAY_MS = 60_000;
const CHARGE_RETRIES = 3;

const chargeBlock = v.union(
  v.literal("company_card_missing"),
  v.literal("creator_not_ready"),
  v.literal("creator_account_missing"),
  v.literal("payout_disputed"),
);

/** Claims due payouts and schedules a charge for each. Run by a cron every minute. */
export const chargeDue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Without Stripe nothing can be charged; claiming would strand the payouts.
    if (!env.STRIPE_SECRET_KEY) return null;
    const claimed = await claimDuePayouts(ctx, CHARGE_BATCH_SIZE);
    for (const payoutId of claimed) {
      await ctx.scheduler.runAfter(0, internal.charging.collect, {
        payoutId,
        retriesLeft: CHARGE_RETRIES,
      });
    }
    if (claimed.length === CHARGE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.charging.chargeDue, {});
    }
    return null;
  },
});

/**
 * Charges one claimed payout: checks the creator's account can accept charges,
 * starts or resumes the attempt, charges, and records the outcome.
 */
export const collect = internalAction({
  args: { payoutId: v.id("payouts"), retriesLeft: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stripe = stripeClient();
    const retryLater = async (step: string, error: unknown): Promise<null> => {
      console.error(`Payout charge ${step} failed`, {
        payoutId: args.payoutId,
        retriesLeft: args.retriesLeft,
        ...stripeErrorDetails(error),
      });
      if (args.retriesLeft > 0) {
        await ctx.scheduler.runAfter(CHARGE_RETRY_DELAY_MS, internal.charging.collect, {
          payoutId: args.payoutId,
          retriesLeft: args.retriesLeft - 1,
        });
      }
      return null;
    };

    // Stripe's live answer, since our stored status tracks payouts, not charges.
    const accountId = await ctx.runQuery(internal.charging.accountFor, { payoutId: args.payoutId });
    let chargesEnabled: boolean | null = null;
    if (accountId !== null) {
      try {
        chargesEnabled = (await stripe.accounts.retrieve(accountId)).charges_enabled;
      } catch (error) {
        if (!isAccountAccessLost(error)) return await retryLater("account check", error);
        // Lost access proves the creator removed Tomoji in Stripe.
        await ctx.runMutation(internal.stripeAccounts.disconnect, {
          stripeAccountId: accountId,
          disconnectedAt: Date.now(),
        });
        chargesEnabled = false;
      }
    }

    const plan = await ctx.runMutation(internal.charging.prepare, {
      payoutId: args.payoutId,
      chargesEnabled,
    });
    if (plan.kind === "blocked") {
      console.log("Payout cannot be charged now", { payoutId: args.payoutId, reason: plan.reason });
    }
    if (plan.kind !== "charge") return null;

    let outcome;
    try {
      outcome = await chargeConnectAccount(stripe, plan);
    } catch (error) {
      // The attempt stays `processing` without a charge id, so the retry resumes it.
      return await retryLater("request", error);
    }
    const paymentId = plan.payment._id;
    await ctx.runMutation(internal.payments.attachIntent, {
      paymentId,
      stripePaymentIntentId: outcome.paymentIntentId,
    });
    // The webhook reports the same outcome later; whichever arrives second is a no-op.
    if (outcome.kind === "succeeded") {
      await ctx.runMutation(internal.payments.recordSucceeded, {
        paymentId,
        stripeAccountId: plan.payment.stripeAccountId,
        stripePaymentIntentId: outcome.paymentIntentId,
        succeededAt: Date.now(),
      });
    } else if (outcome.kind === "failed") {
      await ctx.runMutation(internal.payments.recordFailed, {
        paymentId,
        stripeAccountId: plan.payment.stripeAccountId,
        stripePaymentIntentId: outcome.paymentIntentId,
        failureCode: outcome.failureCode,
      });
    }
    return null;
  },
});

/** The Stripe account a payout would be charged on. See `getChargeAccountId`. */
export const accountFor = internalQuery({
  args: { payoutId: v.id("payouts") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => await getChargeAccountId(ctx, args.payoutId),
});

/** Starts or resumes the payout's attempt, or records why it cannot be charged. See `prepareCharge`. */
export const prepare = internalMutation({
  args: { payoutId: v.id("payouts"), chargesEnabled: v.union(v.boolean(), v.null()) },
  returns: v.union(
    v.object({
      kind: v.literal("charge"),
      payment: schema.doc("payments"),
      stripeCustomerId: v.string(),
      paymentMethodId: v.string(),
      amount: v.number(),
      currency: v.string(),
    }),
    v.object({ kind: v.literal("blocked"), reason: chargeBlock }),
    v.object({ kind: v.literal("settled") }),
  ),
  handler: async (ctx, args) => await prepareCharge(ctx, args.payoutId, args.chargesEnabled),
});
