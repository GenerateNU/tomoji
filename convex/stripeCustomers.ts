import { v } from "convex/values";
import type Stripe from "stripe";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { apiError } from "./lib/errors";
import { companyAdminAction, companyQuery } from "./lib/functions";
import { checkoutReturnUrl, fingerprint, stripeClient, stripeErrorDetails } from "./lib/stripe";
import { requireCompany } from "./models/companies";
import {
  createStripeCustomer,
  getStripeCustomerByCompanyId,
  paymentMethodStatus,
  refreshCard,
  savedPaymentMethod,
  savePaymentMethod,
  stripeCustomerState,
  toPaymentMethodStatus,
} from "./models/stripeCustomers";
import schema from "./schema";

/**
 * The card a company's approved payouts are charged to. Stripe Checkout
 * collects it, so card numbers never reach Tomoji. Only company admins change
 * it; every member can see whether one is on file. Only the platform webhook
 * saves the card.
 *
 * The internal functions are the database steps for `setupPaymentMethod` and
 * the webhook, which cannot read or write the database themselves. Callers
 * pass the company `companyAdminAction` resolved, or a card from a verified
 * Stripe event, never one taken from a client.
 */

/** Whether the company has a card on file: `missing`, or `ready` with the card to display. */
export const me = companyQuery({
  args: {},
  returns: paymentMethodStatus,
  handler: async (ctx) =>
    toPaymentMethodStatus(await getStripeCustomerByCompanyId(ctx, ctx.membership.companyId)),
});

/**
 * Returns a link to Stripe Checkout where a company admin saves a card for
 * future charges, creating the company's Stripe customer on first use. Saving
 * a new card replaces the old one. The link lasts 24 hours but is not stored;
 * call this again for each visit. `returnPath` is the page to come back to,
 * such as `/payouts`, usually the one with the button.
 *
 * @throws `forbidden` with reason `company_admin_required` for a member.
 * @throws `invalid_state` with reason `return_path_invalid` for a path off the Tomoji site.
 * @throws `misconfigured` if the deployment lacks a Stripe key or `SITE_URL`.
 * @throws `upstream_failure` with reason `stripe_customer_failed` or
 * `stripe_checkout_failed` if Stripe rejects either request.
 */
export const setupPaymentMethod = companyAdminAction({
  args: { returnPath: v.string() },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args): Promise<{ url: string }> => {
    // Built before any Stripe call so a misconfigured deployment or a bad path
    // is not reported as a Stripe outage.
    const stripe = stripeClient();
    const returnUrl = checkoutReturnUrl(args.returnPath, "return");
    const cancelUrl = checkoutReturnUrl(args.returnPath, "cancel");
    const companyId = ctx.membership.companyId;

    let customer = await ctx.runQuery(internal.stripeCustomers.getForCompany, { companyId });
    if (customer === null) {
      // Nothing that can change, such as the company name: a retry after a failed
      // save must send the identical request so Stripe returns the same customer
      // instead of creating a second one.
      const params: Stripe.CustomerCreateParams = { metadata: { companyId } };
      let created: Stripe.Customer;
      try {
        created = await stripe.customers.create(params, {
          // Concurrent clicks share this key and get one customer back. The
          // fingerprint changes only if a deploy changes the request.
          idempotencyKey: `stripe-customer:${companyId}:${await fingerprint(params)}`,
        });
      } catch (error) {
        console.error("Stripe refused to create the customer", stripeErrorDetails(error));
        throw apiError("upstream_failure", { reason: "stripe_customer_failed" });
      }
      // Saved before Checkout opens, so a failed session never orphans the customer
      // and the webhook always finds the customer the card belongs to.
      customer = await ctx.runMutation(internal.stripeCustomers.create, {
        companyId,
        state: { stripeCustomerId: created.id, stripeUpdatedAt: created.created * 1000 },
      });
    }

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "setup",
        customer: customer.stripeCustomerId,
        // Payouts are USD only. Setup mode needs a currency to decide which
        // payment methods it may offer.
        currency: "usd",
        // Cards only: they are the type that can be copied to a creator's account
        // and that settles immediately. Bank debits can fail days later.
        allowed_payment_method_types: ["card"],
        success_url: returnUrl,
        cancel_url: cancelUrl,
        metadata: { companyId },
      });
    } catch (error) {
      console.error("Stripe refused the Checkout session", stripeErrorDetails(error));
      throw apiError("upstream_failure", { reason: "stripe_checkout_failed" });
    }
    if (session.url === null) {
      throw apiError("upstream_failure", { reason: "stripe_checkout_failed" });
    }
    return { url: session.url };
  },
});

/**
 * The company's customer, if any.
 *
 * @throws `not_found` if the company no longer exists.
 */
export const getForCompany = internalQuery({
  args: { companyId: v.id("companies") },
  returns: v.union(schema.doc("stripeCustomers"), v.null()),
  handler: async (ctx, args) => {
    await requireCompany(ctx, args.companyId);
    return await getStripeCustomerByCompanyId(ctx, args.companyId);
  },
});

/** Saves the customer Stripe just created, before Checkout opens. */
export const create = internalMutation({
  args: { companyId: v.id("companies"), state: stripeCustomerState },
  returns: schema.doc("stripeCustomers"),
  handler: async (ctx, args) => await createStripeCustomer(ctx, args.companyId, args.state),
});

/** Saves the card from a completed Checkout session. See `savePaymentMethod`. */
export const saveCard = internalMutation({
  args: { saved: savedPaymentMethod },
  returns: v.union(v.literal("updated"), v.literal("stale"), v.literal("unknown")),
  handler: async (ctx, args) => await savePaymentMethod(ctx, args.saved),
});

/** Applies the card network's new details to the saved card. See `refreshCard`. */
export const refreshSavedCard = internalMutation({
  args: { saved: savedPaymentMethod },
  returns: v.union(
    v.literal("updated"),
    v.literal("stale"),
    v.literal("replaced"),
    v.literal("unknown"),
  ),
  handler: async (ctx, args) => await refreshCard(ctx, args.saved),
});
