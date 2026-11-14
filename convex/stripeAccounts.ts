import { v } from "convex/values";
import Stripe from "stripe";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, type ActionCtx } from "./_generated/server";
import { apiError } from "./lib/errors";
import { creatorAction, creatorQuery } from "./lib/functions";
import {
  fingerprint,
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
  stripeAccountState,
  stripeAccountStatus,
  toStripeAccountStatus,
  updateStripeAccount,
} from "./models/stripeAccounts";
import { requireCallerCreatorId } from "./models/users";
import schema from "./schema";

/**
 * Creator payout setup through Stripe Connect. Stripe hosts onboarding; these
 * routes create the account and hand out a short-lived link to it. Creators get
 * Standard accounts and sign in to dashboard.stripe.com themselves, so there is
 * no dashboard link. Only the webhook changes onboarding status.
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

// How far around an attempt's start to look for an account Stripe already made.
// Stripe creates it within seconds of the request; the margin covers clock skew.
const RECOVERY_WINDOW_SECONDS = 10 * 60;

/**
 * What the creator has to do about payouts: `notStarted`, `actionRequired`,
 * `inReview`, `ready`, or `disconnected`.
 */
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
 * account on first use, or a new one after they disconnected Tomoji. The
 * account is made in the creator's profile country, which Stripe can never
 * change. The link expires within minutes, so it is never stored; call this
 * again for each visit.
 *
 * @throws `invalid_state` with reason `country_required` if the creator has not
 * set a country, or `stripe_country_unsupported` if Stripe does not operate there.
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
      account = await createAccount(ctx, stripe, ctx.creatorId);
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

/**
 * Creates the creator's Stripe account and saves it. The attempt is recorded
 * first, so a retry after any failure repeats the same request, and checks
 * whether Stripe already made the account before asking again.
 */
async function createAccount(
  ctx: ActionCtx,
  stripe: Stripe,
  creatorId: Id<"creators">,
): Promise<Doc<"stripeAccounts">> {
  const { attempt, retry } = await ctx.runMutation(internal.stripeAccounts.beginCreation, {
    creatorId,
  });
  // Stripe forgets idempotency keys after 24 hours, so a late retry must look
  // for the account the earlier attempt made instead of relying on the key.
  let created = retry ? await findCreatedAccount(stripe, attempt) : null;
  if (created === null) {
    const params: Stripe.AccountCreateParams = {
      country: attempt.country,
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
      // rejects a request for `transfers` alone. No email either: Stripe asks for it,
      // and nothing here may change between an attempt and its retry.
      metadata: { creatorId },
    };
    try {
      created = await stripe.accounts.create(params, {
        // One key per attempt: concurrent clicks and retries share it and get one
        // account back, while reconnecting starts a new attempt and a new account.
        // The fingerprint changes only if a deploy changes the request, which
        // Stripe would otherwise refuse under the same key.
        idempotencyKey: `stripe-account:${creatorId}:${attempt._id}:${await fingerprint(params)}`,
      });
    } catch (error) {
      console.error("Stripe refused to create the account", stripeErrorDetails(error));
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.code === "country_unsupported"
      ) {
        // Refused outright, so no account exists; the creator may change country.
        await ctx.runMutation(internal.stripeAccounts.abandonCreation, { creatorId });
        throw apiError("invalid_state", { reason: "stripe_country_unsupported" });
      }
      throw apiError("upstream_failure", { reason: "stripe_account_failed" });
    }
  }
  // Saved before requesting the link, so a failed link never orphans the account.
  // Without a creation time, 0 lets the first webhook replace this snapshot.
  return await ctx.runMutation(internal.stripeAccounts.create, {
    creatorId,
    state: toStripeAccountState(created, (created.created ?? 0) * 1000),
  });
}

/** The account an earlier attempt made, found by the creator tag near its start. */
async function findCreatedAccount(
  stripe: Stripe,
  attempt: Doc<"stripeAccountCreations">,
): Promise<Stripe.Account | null> {
  const startedAt = Math.floor(attempt.startedAt / 1000);
  try {
    for await (const account of stripe.accounts.list({
      created: {
        gte: startedAt - RECOVERY_WINDOW_SECONDS,
        lte: startedAt + RECOVERY_WINDOW_SECONDS,
      },
      limit: 100,
    })) {
      if (account.metadata?.creatorId === attempt.creatorId) return account;
    }
  } catch (error) {
    // Creating again is safe within 24 hours, when the idempotency key still holds.
    console.error("Stripe refused to list accounts", stripeErrorDetails(error));
  }
  return null;
}

export const getForCreator = internalQuery({
  args: { creatorId: v.id("creators") },
  returns: v.union(schema.doc("stripeAccounts"), v.null()),
  handler: async (ctx, args) => await getStripeAccountByCreatorId(ctx, args.creatorId),
});

/**
 * Records the attempt, or returns the pending one, using the creator's profile
 * country. See `beginAccountCreation`.
 */
export const beginCreation = internalMutation({
  args: { creatorId: v.id("creators") },
  returns: v.object({ attempt: schema.doc("stripeAccountCreations"), retry: v.boolean() }),
  handler: async (ctx, args) => {
    const creator = await ctx.db.get("creators", args.creatorId);
    return await beginAccountCreation(ctx, args.creatorId, creator?.countryOfResidence);
  },
});

/** Forgets an attempt Stripe refused outright. See `abandonAccountCreation`. */
export const abandonCreation = internalMutation({
  args: { creatorId: v.id("creators") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await abandonAccountCreation(ctx, args.creatorId);
    return null;
  },
});

/** Saves the account Stripe just created, as soon as it exists. */
export const create = internalMutation({
  args: { creatorId: v.id("creators"), state: stripeAccountState },
  returns: schema.doc("stripeAccounts"),
  handler: async (ctx, args) => await createStripeAccount(ctx, args.creatorId, args.state),
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
  handler: async (ctx, args) => await updateStripeAccount(ctx, args.state, args.taggedCreatorId),
});

/** Applies a verified `account.application.deauthorized` event. */
export const disconnect = internalMutation({
  args: { stripeAccountId: v.string(), disconnectedAt: v.number() },
  returns: v.union(v.literal("disconnected"), v.literal("unknown")),
  handler: async (ctx, args) =>
    await disconnectStripeAccount(ctx, args.stripeAccountId, args.disconnectedAt),
});
