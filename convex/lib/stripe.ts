import Stripe from "stripe";
import { env } from "../_generated/server";
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
