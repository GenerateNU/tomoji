import { v } from "convex/values";
import type Stripe from "stripe";
import { internal } from "./_generated/api";
import { apiError } from "./lib/errors";
import { creatorAction, creatorQuery } from "./lib/functions";
import { siteUrl, stripeClient, toStripeAccountState } from "./lib/stripe";
import {
  getStripeAccountByCreatorId,
  stripeAccountStatus,
  toStripeAccountStatus,
} from "./models/stripeAccounts";
import { requireCallerCreatorId } from "./models/users";

/**
 * Creator payout setup through Stripe Connect. Stripe hosts onboarding; these
 * routes create the account and hand out a short-lived link to it. Creators get
 * Standard accounts and sign in to dashboard.stripe.com themselves, so there is
 * no dashboard link. Only the `account.updated` webhook changes onboarding status.
 */

// Where Stripe sends creators back. The profile page holds the Payment card;
// on `refresh` it requests a new link, because the old one expired or was used.
const RETURN_PATH = "/profile?stripe=return";
const REFRESH_PATH = "/profile?stripe=refresh";

/** What the creator has to do about payouts: `notStarted`, `actionRequired`, `inReview`, or `ready`. */
export const me = creatorQuery({
  args: {},
  returns: v.object({ status: stripeAccountStatus }),
  handler: async (ctx) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return { status: toStripeAccountStatus(await getStripeAccountByCreatorId(ctx, creatorId)) };
  },
});

/**
 * Returns a one-time link to Stripe's onboarding, creating the creator's
 * account on first use. The link expires within minutes, so it is never
 * stored; call this again for each visit.
 *
 * @throws `misconfigured` if the deployment lacks a Stripe key or `SITE_URL`.
 * @throws `upstream_failure` with reason `stripe_account_failed` or
 * `stripe_link_failed` if Stripe rejects either request.
 */
export const onboardingLink = creatorAction({
  args: {},
  returns: v.object({ url: v.string() }),
  handler: async (ctx): Promise<{ url: string }> => {
    // Built before any Stripe call so a misconfigured deployment is not
    // reported as a Stripe outage.
    const stripe = stripeClient();
    const returnUrl = siteUrl(RETURN_PATH);
    const refreshUrl = siteUrl(REFRESH_PATH);

    let account = await ctx.runQuery(internal.stripeAccountsInternal.getForCreator, {
      creatorId: ctx.creatorId,
    });
    if (account === null) {
      const params: Stripe.AccountCreateParams = {
        // Payouts are USD only, and Stripe cannot change an account's country later.
        country: "US",
        email: ctx.user.email,
        // Stripe's replacement for `type: "standard"`, chosen over Express to avoid its
        // per-account costs: the creator uses the full Stripe Dashboard, pays Stripe's
        // fees, and Stripe covers negative balances and collects requirements.
        controller: {
          stripe_dashboard: { type: "full" },
          fees: { payer: "account" },
          losses: { payments: "stripe" },
          requirement_collection: "stripe",
        },
        // No `capabilities`: Stripe chooses them by country for Standard accounts and
        // rejects a request for `transfers` alone.
        metadata: { creatorId: ctx.creatorId },
      };
      let created: Stripe.Account;
      try {
        created = await stripe.accounts.create(params, {
          // Concurrent clicks send identical requests, so they share a key and get one
          // account back. Stripe keeps a key's first response for 24 hours and refuses
          // it for different parameters, so the key covers the parameters too: a new
          // email or a deploy that changes them must not lock the creator out.
          idempotencyKey: `stripe-account:${ctx.creatorId}:${await fingerprint(params)}`,
        });
      } catch (error) {
        console.error("Stripe refused to create the account", stripeErrorDetails(error));
        throw apiError("upstream_failure", { reason: "stripe_account_failed" });
      }
      // Saved before requesting the link, so a failed link never orphans the account.
      // Without a creation time, 0 lets the first webhook replace this snapshot.
      account = await ctx.runMutation(internal.stripeAccountsInternal.create, {
        creatorId: ctx.creatorId,
        state: toStripeAccountState(created, (created.created ?? 0) * 1000),
      });
    }

    try {
      const accountLink = await stripe.accountLinks.create({
        account: account.stripeAccountId,
        type: "account_onboarding",
        return_url: returnUrl,
        refresh_url: refreshUrl,
      });
      return { url: accountLink.url };
    } catch (error) {
      console.error("Stripe refused the onboarding link", stripeErrorDetails(error));
      throw apiError("upstream_failure", { reason: "stripe_link_failed" });
    }
  },
});

/** The first 16 hex digits of the SHA-256 of `value`'s JSON; stable for equal objects built the same way. */
async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Stripe's reason for a failed request, for the logs. Stripe errors carry no secrets. */
function stripeErrorDetails(error: unknown): Record<string, string | undefined> {
  if (error instanceof Error) {
    const { type, code } = error as Partial<Stripe.errors.StripeError>;
    return { type, code, message: error.message };
  }
  return { message: String(error) };
}
