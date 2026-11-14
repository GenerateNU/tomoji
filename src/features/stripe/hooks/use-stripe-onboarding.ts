"use client";

import { api } from "@convex/_generated/api";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/errors";

/**
 * The creator's Stripe account status and a `connect` that sends them to
 * Stripe's onboarding, returning to `returnPath` afterwards. When Stripe sends
 * them back with an expired link (`?stripe=refresh`), a fresh one is requested
 * straight away so they land back in the form.
 */
export function useStripeOnboarding(returnPath: string) {
  const account = useQuery(api.stripeAccounts.me);
  const onboardingLink = useAction(api.stripeAccounts.onboardingLink);
  const [pending, setPending] = useState(false);
  // "country" when the profile has no country yet, so pages can link to it.
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setPending(true);
    setError(null);
    try {
      const { url } = await onboardingLink({ returnPath });
      // Stays pending while the browser leaves for Stripe.
      window.location.assign(url);
    } catch (caught) {
      setPending(false);
      setError(isCountryMissing(caught) ? "country" : errorMessage(caught));
    }
  }, [onboardingLink, returnPath]);

  const refreshed = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("stripe");
    if (outcome === null) return;
    // Drop the marker so reloading the page doesn't repeat it.
    params.delete("stripe");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    if (outcome === "refresh" && !refreshed.current) {
      refreshed.current = true;
      void connect();
    }
  }, [connect]);

  return { status: account?.status, connect, pending, error };
}

function isCountryMissing(error: unknown): boolean {
  return (
    error instanceof ConvexError &&
    (error.data as { reason?: unknown } | null)?.reason === "country_required"
  );
}
