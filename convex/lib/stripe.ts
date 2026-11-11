import Stripe from "stripe";
import { env } from "../_generated/server";
import type { StripeAccountState } from "../models/stripeAccounts";
import { apiError } from "./errors";

/**
 * The Stripe client, for actions and HTTP actions. Unlike WorkOS it needs no
 * `"use node"`: the fetch HTTP client runs in Convex's default runtime, which
 * is where the webhook verifies signatures.
 *
 * @throws `misconfigured` if the deployment has no secret key.
 */
export function stripeClient(): Stripe {
  const apiKey = env.STRIPE_SECRET_KEY;
  if (!apiKey) throw apiError("misconfigured", { reason: "stripe_secret_key_missing" });
  return new Stripe(apiKey, { httpClient: Stripe.createFetchHttpClient() });
}

/**
 * A page on the Tomoji frontend, for Stripe's hosted pages to send people back
 * to.
 *
 * @throws `misconfigured` if the deployment has no `SITE_URL`.
 */
export function siteUrl(path: string): string {
  const base = env.SITE_URL;
  if (!base) throw apiError("misconfigured", { reason: "site_url_missing" });
  return new URL(path, base).toString();
}

/**
 * What a Stripe account says about onboarding. `updatedAt` is when Stripe
 * produced it, in Unix ms: the account's creation time, or a webhook event's.
 */
export function toStripeAccountState(
  account: Stripe.Account,
  updatedAt: number,
): StripeAccountState {
  return {
    stripeAccountId: account.id,
    detailsSubmitted: account.details_submitted,
    payoutsEnabled: account.payouts_enabled,
    requirementsDue: (account.requirements?.currently_due?.length ?? 0) > 0,
    stripeUpdatedAt: updatedAt,
  };
}
