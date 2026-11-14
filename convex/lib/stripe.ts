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
