import Stripe from "stripe";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import {
  isAccountAccessLost,
  stripeClient,
  stripeErrorDetails,
  toSavedCard,
  toStripeAccountState,
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

const OK = () => new Response(null, { status: 200 });

/** The verified event, or the response to send when it cannot be verified. */
async function verifiedEvent(
  request: Request,
  secret: string | undefined,
  secretName: string,
): Promise<Stripe.Event | Response> {
  if (!secret) {
    console.error(`Stripe webhook received but ${secretName} is not set`);
    return new Response("Webhook not configured", { status: 500 });
  }
  const signature = request.headers.get("Stripe-Signature");
  if (signature === null) return new Response("Missing signature", { status: 400 });
  try {
    // The raw body: re-serialized JSON would not match the signature.
    return await Stripe.webhooks.constructEventAsync(
      await request.text(),
      signature,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
}

/** Connect events: creators' onboarding status. */
export const stripeWebhook = httpAction(async (ctx, request) => {
  const event = await verifiedEvent(request, env.STRIPE_WEBHOOK_SECRET, "STRIPE_WEBHOOK_SECRET");
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
        return OK();
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
  return OK();
});

/** Events on Tomoji's own account: the cards companies save for payouts. */
export const stripePlatformWebhook = httpAction(async (ctx, request) => {
  const event = await verifiedEvent(
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
      return OK();
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
      return OK();
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
    if (typeof paymentMethod.customer !== "string" || card === null) return OK();
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
  return OK();
});
