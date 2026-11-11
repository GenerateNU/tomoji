import Stripe from "stripe";
import { internal } from "./_generated/api";
import { env, httpAction } from "./_generated/server";
import { toStripeAccountState } from "./lib/stripe";

/**
 * Receives Stripe's Connect events. Only events whose signature matches
 * `STRIPE_WEBHOOK_SECRET` are applied; the payload is otherwise untrusted.
 *
 * Every verified event gets a 200, including types it ignores and accounts
 * this deployment does not own, because anything else makes Stripe retry for
 * days. A 500 is reserved for a missing secret, so Stripe keeps the events
 * until it is set.
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
    const account = event.data.object;
    const result = await ctx.runMutation(internal.stripeAccountsInternal.update, {
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
  return new Response(null, { status: 200 });
});
