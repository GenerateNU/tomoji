import Stripe from "stripe";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import {
  isAccountAccessLost,
  stripeClient,
  stripeErrorDetails,
  toStripeAccountState,
} from "./lib/stripe";

// How long after saving an account to read it from Stripe again. Long enough for
// overlapping deliveries of the same change to have saved.
const ACCOUNT_RECHECK_DELAY_MS = 5_000;

/**
 * Receives Stripe's Connect events. Only events whose signature matches
 * `STRIPE_WEBHOOK_SECRET` are applied; the payload is otherwise untrusted.
 *
 * Every verified event gets a 200, including types it ignores and accounts
 * this deployment does not own, because anything else makes Stripe retry for
 * days. A 500 is reserved for failures worth retrying, such as a missing
 * secret or Stripe being unreachable, so Stripe keeps the events until fixed.
 */
export const stripeWebhook = httpAction(async (ctx, request) => {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("Stripe webhook received but STRIPE_WEBHOOK_SECRET is not set");
    return new Response("Webhook not configured", { status: 500 });
  }
  const signature = request.headers.get("Stripe-Signature");
  if (signature === null) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    // The raw body: re-serialized JSON would not match the signature.
    event = await Stripe.webhooks.constructEventAsync(
      await request.text(),
      signature,
      secret,
      undefined,
      Stripe.createSubtleCryptoProvider(),
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

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
        return new Response(null, { status: 200 });
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
  return new Response(null, { status: 200 });
});
