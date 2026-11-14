import Stripe from "stripe";
import type { Doc } from "../_generated/dataModel";
import { env } from "../_generated/server";
import type { StripeAccountState } from "../models/stripeAccounts";
import type { SavedPaymentMethod } from "../models/stripeCustomers";
import { apiError } from "./errors";

// How far before an attempt's start to look for the account it made: our clock
// and Stripe's can differ. There is no upper bound, because a retry can come
// hours later and the account's creation time is whenever Stripe processed it.
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
 * The page on the Tomoji site Checkout sends the admin back to, marked with
 * `stripe=return` or `stripe=cancel`. Returning does not mean the card is
 * saved; `me` updates when the webhook arrives.
 *
 * @throws `invalid_state` with reason `return_path_invalid` unless `returnPath`
 * is a path on the Tomoji site, so the flow cannot redirect to another site.
 */
export function checkoutReturnUrl(returnPath: string, outcome: "return" | "cancel"): string {
  const url = new URL(siteUrl(returnPath));
  // `//host` and `/\host` resolve to another origin, so compare origins too.
  if (!returnPath.startsWith("/") || url.origin !== new URL(siteUrl("/")).origin) {
    throw apiError("invalid_state", { reason: "return_path_invalid" });
  }
  url.searchParams.set("stripe", outcome);
  return url.toString();
}

/** Acknowledges a webhook event: anything but 2xx makes Stripe retry for days. */
export const webhookOk = () => new Response(null, { status: 200 });

/**
 * The verified Stripe event in a webhook request, or the response to send
 * when it cannot be verified: 500 while the signing secret is unset, so Stripe
 * keeps the events, and 400 for a missing or wrong signature.
 */
export async function verifyWebhookEvent(
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

/**
 * Whether Stripe refused because Tomoji no longer has access to a connected
 * account: the creator removed Tomoji in Stripe. Other permission errors mean
 * our own key lacks a permission, which is a misconfiguration to retry after,
 * not a disconnect.
 */
export function isAccountAccessLost(error: unknown): boolean {
  return error instanceof Stripe.errors.StripePermissionError && error.code === "account_invalid";
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
 * accounts created since the attempt started. Stripe offers no lookup by
 * idempotency key and its Search API does not cover accounts, so this lists
 * by creation time. Stripe can forget idempotency keys after 24 hours, so a
 * late retry relies on this rather than on the key. `replacedAccountId` is the
 * creator's disconnected account, if reconnecting, which is never returned.
 *
 * @throws `upstream_failure` with reason `stripe_account_failed` if Stripe
 * cannot be asked, since that proves nothing about whether the account exists.
 */
export async function findCreatedConnectAccount(
  stripe: Stripe,
  attempt: Doc<"stripeAccountCreations">,
  replacedAccountId: string | undefined,
): Promise<Stripe.Account | null> {
  const startedAt = Math.floor(attempt.startedAt / 1000);
  try {
    for await (const account of stripe.accounts.list({
      created: { gte: startedAt - RECOVERY_WINDOW_SECONDS },
      limit: 100,
    })) {
      // The disconnected account being replaced carries the same tag, and can fall
      // inside the window if the creator reconnects soon after connecting.
      if (account.metadata?.creatorId === attempt.creatorId && account.id !== replacedAccountId) {
        return account;
      }
    }
  } catch (error) {
    // Failing to look is not the same as finding nothing: creating now could make
    // a second account once Stripe has forgotten the original key. Keep the
    // attempt so the next retry looks again.
    console.error("Stripe refused to list accounts", stripeErrorDetails(error));
    throw apiError("upstream_failure", { reason: "stripe_account_failed" });
  }
  return null;
}

/**
 * The card details Tomoji keeps from a payment method, or null if it is not a
 * card. The brand is the one Stripe displays, which for a co-branded card is
 * the network the cardholder chose.
 */
export function toSavedCard(
  paymentMethod: Stripe.PaymentMethod,
): SavedPaymentMethod["card"] | null {
  const card = paymentMethod.card;
  if (!card) return null;
  return {
    paymentMethodId: paymentMethod.id,
    brand: card.display_brand ?? card.brand,
    last4: card.last4,
    expMonth: card.exp_month,
    expYear: card.exp_year,
  };
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
    rejected: account.requirements?.disabled_reason?.startsWith("rejected") ?? false,
    stripeUpdatedAt: updatedAt,
  };
}
