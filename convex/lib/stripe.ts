import Stripe from "stripe";
import type { Doc } from "../_generated/dataModel";
import { env } from "../_generated/server";
import type { StripeAccountState } from "../models/stripeAccounts";
import { apiError } from "./errors";

// How far around an attempt's start to look for an account Stripe already made.
// Stripe creates it within seconds of the request; the margin covers clock skew.
const RECOVERY_WINDOW_SECONDS = 10 * 60;

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
 * The first 16 hex digits of the SHA-256 of `value`'s JSON; stable for equal
 * objects built the same way. Idempotency keys include it because Stripe keeps
 * a key's first response for 24 hours and refuses it for different parameters.
 */
export async function fingerprint(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(value)),
  );
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** Stripe's reason for a failed request, for the logs. Stripe errors carry no secrets. */
export function stripeErrorDetails(error: unknown): Record<string, string | undefined> {
  if (error instanceof Error) {
    const { type, code } = error as Partial<Stripe.errors.StripeError>;
    return { type, code, message: error.message };
  }
  return { message: String(error) };
}

/**
 * Asks Stripe for a creator's Standard account for this attempt, in the
 * attempt's country. Retries of the same attempt send the identical request
 * under the same idempotency key, so Stripe returns one account.
 *
 * @returns `country_unsupported` or `rejected` if Stripe refused the request
 * as invalid, which proves no account was made, after logging Stripe's reason.
 * @throws `upstream_failure` with reason `stripe_account_failed` for any other
 * failure, such as a network error, which leaves it unknown whether Stripe
 * made the account.
 */
export async function createConnectAccount(
  stripe: Stripe,
  attempt: Doc<"stripeAccountCreations">,
): Promise<Stripe.Account | "country_unsupported" | "rejected"> {
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
    metadata: { creatorId: attempt.creatorId },
  };
  try {
    return await stripe.accounts.create(params, {
      // One key per attempt: concurrent clicks and retries share it and get one
      // account back, while reconnecting starts a new attempt and a new account.
      // The fingerprint changes only if a deploy changes the request, which
      // Stripe would otherwise refuse under the same key.
      idempotencyKey: `stripe-account:${attempt.creatorId}:${attempt._id}:${await fingerprint(params)}`,
    });
  } catch (error) {
    console.error("Stripe refused to create the account", stripeErrorDetails(error));
    if (error instanceof Stripe.errors.StripeInvalidRequestError) {
      return error.code === "country_unsupported" ? "country_unsupported" : "rejected";
    }
    throw apiError("upstream_failure", { reason: "stripe_account_failed" });
  }
}

/**
 * The account an earlier attempt made, if any, found by its creator tag among
 * accounts created around the attempt's start. Stripe offers no lookup by
 * idempotency key and its Search API does not cover accounts, so this lists
 * by creation time. Stripe forgets idempotency keys after 24 hours, so a late
 * retry relies on this rather than on the key.
 */
export async function findCreatedConnectAccount(
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

/**
 * What a Stripe account says about onboarding. `updatedAt` is when Tomoji
 * received it from Stripe, in Unix ms on our clock, so later reads win.
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
