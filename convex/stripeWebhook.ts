import Stripe from "stripe";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import {
  isAccountAccessLost,
  stripeClient,
  stripeErrorDetails,
  toSavedCard,
  toStripeAccountState,
  verifyWebhookEvent,
  webhookOk,
} from "./lib/stripe";

// How long after saving an account to read it from Stripe again. Long enough for
// overlapping deliveries of the same change to have saved.
const ACCOUNT_RECHECK_DELAY_MS = 5_000;

/**
 * Stripe sends two kinds of events to two destinations, each with its own
 * signing secret: Connect events about creators' accounts to `/stripe/webhook`,
 * and events on Tomoji's own account, such as a company saving a card, to
 * `/stripe/webhook/platform`. Only events whose signature matches are applied;
 * the payload is otherwise untrusted.
 *
 * Every verified event gets a 200, including types a route ignores and objects
 * this deployment does not own, because anything else makes Stripe retry for
 * days. A 500 is reserved for failures worth retrying, such as a missing
 * secret or Stripe being unreachable, so Stripe keeps the events until fixed.
 */

/** Connect events: creators' onboarding status. */
export const stripeWebhook = httpAction(async (ctx, request) => {
  const event = await verifyWebhookEvent(
    request,
    env.STRIPE_WEBHOOK_SECRET,
    "STRIPE_WEBHOOK_SECRET",
  );
  if (event instanceof Response) return event;

  if (event.type === "account.updated") {
    // Two updates in one second share a timestamp and can arrive in either order,
    // so the account is read from Stripe as it is now rather than from the event.
    let account: Stripe.Account;
    try {
      account = await stripeClient().accounts.retrieve(event.data.object.id);
    } catch (error) {
      if (isAccountAccessLost(error)) {
        // Lost access proves the creator removed Tomoji, even if the
        // deauthorization event is late or missing. Retrying would fail for days.
        await ctx.runMutation(internal.stripeAccounts.disconnect, {
          stripeAccountId: event.data.object.id,
          disconnectedAt: Date.now(),
        });
        console.log("Stripe account no longer accessible", {
          eventId: event.id,
          stripeAccountId: event.data.object.id,
        });
        return webhookOk();
      }
      console.error("Stripe refused the account", stripeErrorDetails(error));
      return new Response("Could not fetch the account", { status: 500 });
    }
    const result = await ctx.runMutation(internal.stripeAccounts.update, {
      // When this read finished, not the event's time: concurrent deliveries can
      // save in either order, and the later read reflects Stripe's newer state.
      state: toStripeAccountState(account, Date.now()),
      taggedCreatorId: account.metadata?.creatorId,
    });
    if (result !== "unknown") {
      await ctx.scheduler.runAfter(ACCOUNT_RECHECK_DELAY_MS, internal.stripeAccounts.recheck, {
        stripeAccountId: account.id,
      });
      console.log("Stripe account updated", {
        eventId: event.id,
        stripeAccountId: account.id,
        result,
      });
    }
  }

  if (event.type === "account.application.deauthorized" && event.account !== undefined) {
    // The connected account is `event.account`; `data.object` is Tomoji's application.
    const result = await ctx.runMutation(internal.stripeAccounts.disconnect, {
      stripeAccountId: event.account,
      disconnectedAt: event.created * 1000,
    });
    if (result !== "unknown") {
      console.log("Stripe account disconnected", {
        eventId: event.id,
        stripeAccountId: event.account,
      });
    }
  }

  // Payout charges are made on the creator's account, so their events come here.
  // Each carries the `paymentId` Tomoji tagged it with; untagged charges are not ours.
  if (
    (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") &&
    event.account !== undefined
  ) {
    const intent = event.data.object;
    const paymentId = intent.metadata?.paymentId;
    if (paymentId === undefined) return webhookOk();
    const result =
      event.type === "payment_intent.succeeded"
        ? await ctx.runMutation(internal.payments.recordSucceeded, {
            paymentId,
            stripeAccountId: event.account,
            stripePaymentIntentId: intent.id,
            succeededAt: event.created * 1000,
          })
        : await ctx.runMutation(internal.payments.recordFailed, {
            paymentId,
            stripeAccountId: event.account,
            stripePaymentIntentId: intent.id,
            // The issuer's reason, such as `insufficient_funds`, when it gave one.
            failureCode:
              intent.last_payment_error?.decline_code ??
              intent.last_payment_error?.code ??
              "unknown",
          });
    if (result !== "unknown") {
      console.log("Payout charge settled", {
        eventId: event.id,
        type: event.type,
        result,
      });
    }
  }

  // Stripe attaches the fee a few seconds after the charge succeeds and
  // announces it as a charge update; other charge updates carry no new fee.
  if (event.type === "charge.updated" && event.account !== undefined) {
    const charge = event.data.object;
    const paymentId = charge.metadata?.paymentId;
    const feeArrived =
      event.data.previous_attributes !== undefined &&
      "balance_transaction" in event.data.previous_attributes;
    if (paymentId === undefined || !feeArrived || typeof charge.balance_transaction !== "string") {
      return webhookOk();
    }
    let transaction: Stripe.BalanceTransaction;
    try {
      transaction = await stripeClient().balanceTransactions.retrieve(
        charge.balance_transaction,
        {},
        { stripeAccount: event.account },
      );
    } catch (error) {
      console.error("Stripe refused the balance transaction", stripeErrorDetails(error));
      return new Response("Could not fetch the fee", { status: 500 });
    }
    // In the creator account's currency: Stripe converts a USD charge for
    // accounts outside the US, and its fee includes the conversion.
    const result = await ctx.runMutation(internal.payments.recordFee, {
      paymentId,
      stripeAccountId: event.account,
      stripeFee: transaction.fee,
      creatorNet: transaction.net,
      settlementCurrency: transaction.currency,
    });
    if (result !== "unknown") {
      console.log("Payout charge fee recorded", { eventId: event.id, result });
    }
  }
  // Charges reversed outside Tomoji, days after they succeeded: the company
  // disputing with its bank, or the creator refunding from their Dashboard.
  // Both name the charge, which the attempt saved when it was made.
  if (
    (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") &&
    event.account !== undefined
  ) {
    const dispute = event.data.object;
    const intentId =
      typeof dispute.payment_intent === "string"
        ? dispute.payment_intent
        : dispute.payment_intent?.id;
    if (intentId === undefined) return webhookOk();
    const details = {
      stripeAccountId: event.account,
      stripePaymentIntentId: intentId,
      stripeDisputeId: dispute.id,
      reason: dispute.reason,
      amount: dispute.amount,
    };
    const result =
      event.type === "charge.dispute.created"
        ? await ctx.runMutation(internal.payments.disputeOpened, details)
        : // Only `lost` keeps the money; Stripe's other closing results return it.
          await ctx.runMutation(internal.payments.disputeClosed, {
            ...details,
            won: dispute.status !== "lost",
          });
    if (result !== "unknown") {
      console.log("Payout charge disputed", { eventId: event.id, type: event.type, result });
    }
  }

  if (event.type === "charge.refunded" && event.account !== undefined) {
    const charge = event.data.object;
    const intentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (intentId === undefined) return webhookOk();
    const result = await ctx.runMutation(internal.payments.refunded, {
      stripeAccountId: event.account,
      stripePaymentIntentId: intentId,
      refundedAmount: charge.amount_refunded,
    });
    if (result !== "unknown") {
      console.log("Payout charge refunded", { eventId: event.id, result });
    }
  }
  return webhookOk();
});

/** Events on Tomoji's own account: the cards companies save for payouts. */
export const stripePlatformWebhook = httpAction(async (ctx, request) => {
  const event = await verifyWebhookEvent(
    request,
    env.STRIPE_PLATFORM_WEBHOOK_SECRET,
    "STRIPE_PLATFORM_WEBHOOK_SECRET",
  );
  if (event instanceof Response) return event;

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    // Payment-mode sessions belong to other features; only setup saves a card.
    if (
      session.mode !== "setup" ||
      typeof session.customer !== "string" ||
      typeof session.setup_intent !== "string"
    ) {
      return webhookOk();
    }
    // The event names the SetupIntent but not the card it saved.
    let setupIntent: Stripe.SetupIntent;
    try {
      setupIntent = await stripeClient().setupIntents.retrieve(session.setup_intent, {
        expand: ["payment_method"],
      });
    } catch (error) {
      console.error("Stripe refused the SetupIntent", stripeErrorDetails(error));
      return new Response("Could not fetch the saved card", { status: 500 });
    }
    const paymentMethod = setupIntent.payment_method;
    const card =
      paymentMethod !== null && typeof paymentMethod !== "string"
        ? toSavedCard(paymentMethod)
        : null;
    if (card === null) {
      // Checkout only offers cards, so a retry would not find one either.
      console.error("Stripe setup session saved no card", {
        eventId: event.id,
      });
      return webhookOk();
    }
    const result = await ctx.runMutation(internal.stripeCustomers.saveCard, {
      saved: {
        stripeCustomerId: session.customer,
        card,
        stripeUpdatedAt: event.created * 1000,
      },
    });
    if (result !== "unknown") {
      console.log("Company card saved", {
        eventId: event.id,
        stripeCustomerId: session.customer,
        result,
      });
    }
  }

  if (event.type === "payment_method.automatically_updated") {
    // The card network renewed or reissued a saved card, usually with a new expiry.
    // Two updates in one second share a timestamp and can arrive in either order,
    // so the card is read from Stripe as it is now rather than from the event.
    let paymentMethod: Stripe.PaymentMethod;
    try {
      paymentMethod = await stripeClient().paymentMethods.retrieve(event.data.object.id);
    } catch (error) {
      console.error("Stripe refused the payment method", stripeErrorDetails(error));
      return new Response("Could not fetch the updated card", { status: 500 });
    }
    const card = toSavedCard(paymentMethod);
    if (typeof paymentMethod.customer !== "string" || card === null) return webhookOk();
    const result = await ctx.runMutation(internal.stripeCustomers.refreshSavedCard, {
      saved: {
        stripeCustomerId: paymentMethod.customer,
        card,
        stripeUpdatedAt: event.created * 1000,
      },
    });
    if (result !== "unknown") {
      console.log("Company card refreshed", {
        eventId: event.id,
        stripeCustomerId: paymentMethod.customer,
        result,
      });
    }
  }
  return webhookOk();
});
