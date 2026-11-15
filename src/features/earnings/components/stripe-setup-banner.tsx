"use client";

import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { BrandButton } from "@/components/brand-button";
import { useStripeOnboarding } from "@/features/stripe/hooks/use-stripe-onboarding";

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
  // Stripe sends the creator back here; the hook also renews an expired link.
  // `error` is "country" when the profile has no country yet, which gets a link to fix it.
  const { status, connect, pending, error } = useStripeOnboarding("/earnings");

  if (status === undefined || status === "ready") return null;
  const copy = COPY[status];

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
          label={status === "actionRequired" ? "Continue on" : "Connect"}
          disabled={pending}
          aria-busy={pending}
          onClick={() => void connect()}
          // The wordmark's box leaves room for the "p" below the line, so it
          // reads high next to the label; this lines it up with "Connect".
          className="self-start sm:self-auto [&_svg]:translate-y-0.5"
        />
      )}
    </section>
  );
}
