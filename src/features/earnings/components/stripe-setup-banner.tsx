"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import Link from "next/link";
import { useState } from "react";
import { BrandButton } from "@/components/brand-button";
import { errorMessage } from "@/lib/errors";

type StripeStatus = FunctionReturnType<typeof api.stripeAccounts.me>["status"];

// What each account status asks of the creator. `canContinue` shows the button
// that sends them to Stripe's onboarding.
const COPY: Record<
  Exclude<StripeStatus, "ready">,
  { title: string; body: string; canContinue: boolean }
> = {
  notStarted: {
    title: "Connect Stripe",
    body: "This is how money gets into your bank account.",
    canContinue: true,
  },
  actionRequired: {
    title: "Finish setting up Stripe",
    body: "Stripe needs a few more details before it can pay you. Your earnings wait until then.",
    canContinue: true,
  },
  inReview: {
    title: "Stripe is reviewing your account",
    body: "This usually takes a few minutes. Your earnings are paid once Stripe approves it.",
    canContinue: false,
  },
  rejected: {
    title: "Stripe couldn't verify your account",
    body: "Contact Stripe support from your Stripe Dashboard to start getting paid.",
    canContinue: false,
  },
  disconnected: {
    title: "Reconnect Stripe",
    body: "You removed Tomoji from your Stripe account, so your earnings are on hold.",
    canContinue: true,
  },
};

/** Tells a creator what's left before they can be paid. Hidden once Stripe is ready. */
export function StripeSetupBanner() {
  const account = useQuery(api.stripeAccounts.me);
  const onboardingLink = useAction(api.stripeAccounts.onboardingLink);
  const [pending, setPending] = useState(false);
  // "country" when the profile has no country yet, which gets a link to fix it.
  const [error, setError] = useState<string | null>(null);

  if (account === undefined || account.status === "ready") return null;
  const copy = COPY[account.status];

  async function connect() {
    setPending(true);
    setError(null);
    try {
      const { url } = await onboardingLink();
      // Stays pending while the browser leaves for Stripe.
      window.location.assign(url);
    } catch (caught) {
      setPending(false);
      setError(isCountryMissing(caught) ? "country" : errorMessage(caught));
    }
  }

  return (
    <section
      aria-labelledby="stripe-setup-title"
      className="flex flex-col gap-4 rounded bg-gray-50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex flex-col gap-1">
        <h2 id="stripe-setup-title" className="text-body font-medium text-gray-950">
          {copy.title}
        </h2>
        <p className="text-body-sm text-gray-500">{copy.body}</p>
        {error !== null && (
          <p role="alert" className="text-body-sm text-red-600">
            {error === "country" ? (
              <>
                Add your country on your{" "}
                <Link href="/profile" className="underline underline-offset-4">
                  profile
                </Link>{" "}
                first. Stripe uses it to set up your account.
              </>
            ) : (
              error
            )}
          </p>
        )}
      </div>
      {copy.canContinue && (
        <BrandButton
          brand="stripe"
          variant="primary"
          label={account.status === "actionRequired" ? "Continue on" : "Connect"}
          disabled={pending}
          aria-busy={pending}
          onClick={connect}
          // The wordmark's box leaves room for the "p" below the line, so it
          // reads high next to the label; this lines it up with "Connect".
          className="self-start sm:self-auto [&_svg]:translate-y-0.5"
        />
      )}
    </section>
  );
}

function isCountryMissing(error: unknown): boolean {
  return (
    error instanceof ConvexError &&
    (error.data as { reason?: unknown } | null)?.reason === "country_required"
  );
}
