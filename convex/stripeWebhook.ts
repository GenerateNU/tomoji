import Stripe from "stripe";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import { stripeClient, stripeErrorDetails, toStripeAccountState } from "./lib/stripe";

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
      if (error instanceof Stripe.errors.StripePermissionError) {
        // The creator disconnected Tomoji; `account.application.deauthorized`
        // records that. Retrying would fail the same way for days.
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
      // Stripe's event time, not ours, decides which state is newer.
      state: toStripeAccountState(account, event.created * 1000),
      taggedCreatorId: account.metadata?.creatorId,
    });
    if (result !== "unknown") {
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
