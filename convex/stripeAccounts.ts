import { v } from "convex/values";
import Stripe from "stripe";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { apiError } from "./lib/errors";
import { creatorAction, creatorQuery } from "./lib/functions";
import {
  createConnectAccount,
  findCreatedConnectAccount,
  isAccountAccessLost,
  siteUrl,
  stripeClient,
  stripeErrorDetails,
  toStripeAccountState,
} from "./lib/stripe";
import {
  abandonAccountCreation,
  beginAccountCreation,
  createStripeAccount,
  disconnectStripeAccount,
  getStripeAccountByCreatorId,
  getStripeAccountByStripeId,
  stripeAccountState,
  stripeAccountStatus,
  toStripeAccountStatus,
  updateStripeAccount,
} from "./models/stripeAccounts";
import { requeueCreatorPayouts } from "./models/payments";
import { requireCallerCreatorId } from "./models/users";
import schema from "./schema";

/**
 * Creator payout setup through Stripe Connect. Stripe hosts onboarding; these
 * routes create the account and hand out a short-lived link to it. Creators get
 * Standard accounts and sign in to dashboard.stripe.com themselves, so there is
 * no dashboard link. After `onboardingLink` saves an account, only what Stripe
 * reports changes its status.
 *
 * The internal functions are the database steps for `onboardingLink` and the
 * webhook, which cannot read or write the database themselves. Callers pass the
 * creator `creatorAction` resolved, or an account from a verified Stripe event,
 * never one taken from a client.
 */

// Where Stripe sends creators back. The profile page holds the Payment card;
// on `refresh` it requests a new link, because the old one expired or was used.
const RETURN_PATH = "/profile?stripe=return";
const REFRESH_PATH = "/profile?stripe=refresh";

/**
 * What the creator has to do about payouts: `notStarted`, `actionRequired`,
 * `inReview`, `ready`, `rejected`, or `disconnected`.
 */
export const me = creatorQuery({
  args: {},
  returns: v.object({ status: stripeAccountStatus }),
  handler: async (ctx) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return {
      status: toStripeAccountStatus(await getStripeAccountByCreatorId(ctx, creatorId)),
    };
  },
});

/**
 * Returns a one-time link to Stripe's onboarding, creating the creator's
 * account on first use, or a new one after they disconnected Tomoji. The
 * account is made in the creator's profile country, which Stripe can never
 * change. The link expires within minutes, so it is never stored; call this
 * again for each visit.
 *
 * @throws `invalid_state` with reason `country_required` if the creator has not
 * set a country, `stripe_country_unsupported` if Stripe does not operate there,
 * or `stripe_account_disconnected` if the creator removed Tomoji in Stripe; the
 * next call then creates a new account.
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

    let account = await ctx.runQuery(internal.stripeAccounts.getForCreator, {
      creatorId: ctx.creatorId,
    });
    if (account === null || account.disconnectedAt !== undefined) {
      // Recorded before Stripe is called, so a retry after any failure repeats
      // the same request instead of creating a second account.
      const begun = await ctx.runMutation(internal.stripeAccounts.beginCreation, {
        creatorId: ctx.creatorId,
      });
      if ("account" in begun) {
        // A concurrent request saved the account after this one looked.
        account = begun.account;
      } else {
        const { attempt, retry } = begun;
        const created =
          (retry
            ? await findCreatedConnectAccount(stripe, attempt, account?.stripeAccountId)
            : null) ?? (await createConnectAccount(stripe, attempt));
        if (created === "country_unsupported" || created === "rejected") {
          // Stripe refused the request, so no account exists. A retry starts a
          // fresh attempt, letting the creator change country or a fix take effect,
          // instead of Stripe replaying the refusal under the old key for 24 hours.
          await ctx.runMutation(internal.stripeAccounts.abandonCreation, {
            attemptId: attempt._id,
          });
          throw created === "country_unsupported"
            ? apiError("invalid_state", {
                reason: "stripe_country_unsupported",
              })
            : apiError("upstream_failure", { reason: "stripe_account_failed" });
        }
        // Saved before requesting the link, so a failed link never orphans the
        // account. Stamped with when it arrived, on the clock the webhook uses.
        account = await ctx.runMutation(internal.stripeAccounts.create, {
          creatorId: ctx.creatorId,
          state: toStripeAccountState(created, Date.now()),
          attemptId: attempt._id,
        });
      }
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
      if (isAccountAccessLost(error)) {
        // Tomoji lost access, so the creator removed it in Stripe, even if the
        // disconnect event is late or missing. The next click reconnects.
        await ctx.runMutation(internal.stripeAccounts.disconnect, {
          stripeAccountId: account.stripeAccountId,
          disconnectedAt: Date.now(),
        });
        throw apiError("invalid_state", {
          reason: "stripe_account_disconnected",
        });
      }
      throw apiError("upstream_failure", { reason: "stripe_link_failed" });
    }
  },
});

export const getForCreator = internalQuery({
  args: { creatorId: v.id("creators") },
  returns: v.union(schema.doc("stripeAccounts"), v.null()),
  handler: async (ctx, args) => await getStripeAccountByCreatorId(ctx, args.creatorId),
});

/** Records the attempt, or returns the pending one. See `beginAccountCreation`. */
export const beginCreation = internalMutation({
  args: { creatorId: v.id("creators") },
  returns: v.union(
    v.object({ account: schema.doc("stripeAccounts") }),
    v.object({
      attempt: schema.doc("stripeAccountCreations"),
      retry: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => await beginAccountCreation(ctx, args.creatorId),
});

/** Forgets an attempt Stripe refused outright. See `abandonAccountCreation`. */
export const abandonCreation = internalMutation({
  args: { attemptId: v.id("stripeAccountCreations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await abandonAccountCreation(ctx, args.attemptId);
    return null;
  },
});

/** Saves the account Stripe just created, as soon as it exists. */
export const create = internalMutation({
  args: {
    creatorId: v.id("creators"),
    state: stripeAccountState,
    attemptId: v.id("stripeAccountCreations"),
  },
  returns: schema.doc("stripeAccounts"),
  handler: async (ctx, args) =>
    await createStripeAccount(ctx, args.creatorId, args.state, args.attemptId),
});

/** Applies a verified `account.updated` event from the Stripe webhook. */
export const update = internalMutation({
  args: { state: stripeAccountState, taggedCreatorId: v.optional(v.string()) },
  returns: v.union(
    v.literal("updated"),
    v.literal("stale"),
    v.literal("adopted"),
    v.literal("unknown"),
  ),
  handler: async (ctx, args) => {
    const result = await updateStripeAccount(ctx, args.state, args.taggedCreatorId);
    if (result === "updated" || result === "adopted") {
      // Payouts blocked on the creator's account can be charged once it is ready.
      const account = await getStripeAccountByStripeId(ctx, args.state.stripeAccountId);
      if (account !== null && toStripeAccountStatus(account) === "ready") {
        await requeueCreatorPayouts(ctx, account.creatorId);
      }
    }
    return result;
  },
});

/** Applies a verified `account.application.deauthorized` event. */
export const disconnect = internalMutation({
  args: { stripeAccountId: v.string(), disconnectedAt: v.number() },
  returns: v.union(v.literal("disconnected"), v.literal("unknown")),
  handler: async (ctx, args) =>
    await disconnectStripeAccount(ctx, args.stripeAccountId, args.disconnectedAt),
});

/**
 * Reads the account from Stripe again and saves it, a few seconds after the
 * webhook saved it. Overlapping deliveries can save in either order, and
 * their stamps can tie or come from servers whose clocks differ slightly;
 * this later read settles the account on Stripe's real state. Best effort:
 * the next `account.updated` corrects anything it misses.
 */
export const recheck = internalAction({
  args: { stripeAccountId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    let account: Stripe.Account;
    try {
      account = await stripeClient().accounts.retrieve(args.stripeAccountId);
    } catch (error) {
      if (isAccountAccessLost(error)) {
        // Lost access proves the creator removed Tomoji since the save.
        await ctx.runMutation(internal.stripeAccounts.disconnect, {
          stripeAccountId: args.stripeAccountId,
          disconnectedAt: Date.now(),
        });
      } else {
        console.error("Stripe refused the account re-check", stripeErrorDetails(error));
      }
      return null;
    }
    await ctx.runMutation(internal.stripeAccounts.update, {
      state: toStripeAccountState(account, Date.now()),
      taggedCreatorId: account.metadata?.creatorId,
    });
    return null;
  },
});
