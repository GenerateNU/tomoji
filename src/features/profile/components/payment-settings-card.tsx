"use client";

import { useId, type ReactNode } from "react";
import { BrandButton } from "@/components/brand-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Action = { onConnect: () => void; error?: ReactNode };

export type PaymentConnection =
  | { status: "unavailable" }
  | ({ status: "disconnected" } & Action)
  // Started onboarding but Stripe still needs details.
  | ({ status: "actionRequired" } & Action)
  // Removed Tomoji in Stripe; connecting again makes a new account.
  | ({ status: "removed" } & Action)
  | { status: "connecting" }
  | { status: "inReview" }
  | { status: "rejected" }
  | { status: "connected" };

const COPY: Record<PaymentConnection["status"], { title: string; body: string }> = {
  unavailable: {
    title: "Connect your Stripe account",
    body: "This is how money gets into your bank account.",
  },
  disconnected: {
    title: "Connect your Stripe account",
    body: "This is how money gets into your bank account.",
  },
  connecting: {
    title: "Connect your Stripe account",
    body: "This is how money gets into your bank account.",
  },
  actionRequired: {
    title: "Finish setting up Stripe",
    body: "Stripe needs a few more details before it can pay you. Your earnings wait until then.",
  },
  removed: {
    title: "Reconnect Stripe",
    body: "You removed Tomoji from your Stripe account, so your earnings are on hold.",
  },
  inReview: {
    title: "Stripe is reviewing your account",
    body: "This usually takes a few minutes. You'll be paid once Stripe approves it.",
  },
  rejected: {
    title: "Stripe couldn't verify your account",
    body: "Contact Stripe support from your Stripe Dashboard to start getting paid.",
  },
  connected: {
    title: "Stripe connected",
    body: "Payouts go straight to the bank account on your Stripe account.",
  },
};

/** Connection states are supplied by the payment integration; this card never invents success. */
export function PaymentSettingsCard({
  connection = { status: "unavailable" },
}: {
  connection?: PaymentConnection;
}) {
  const headingId = useId();
  const { title, body } = COPY[connection.status];
  const action = "onConnect" in connection ? connection : null;

  return (
    <section
      aria-labelledby={headingId}
      className="w-full max-w-[34rem] space-y-3 rounded-lg bg-card p-5 shadow-card"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h2 id={headingId} className="text-body font-medium">
            {title}
          </h2>
          <p className="text-body-sm text-muted-foreground">{body}</p>
        </div>
        {connection.status === "connected" ? (
          <Badge tone="primary" size="md" role="status">
            Connected
          </Badge>
        ) : connection.status === "inReview" ? (
          <Badge size="md" role="status">
            In review
          </Badge>
        ) : connection.status === "rejected" ? null : connection.status === "connecting" ? (
          <Button disabled aria-busy="true" className="self-start sm:self-auto">
            Connecting…
          </Button>
        ) : (
          <BrandButton
            brand="stripe"
            variant="primary"
            label={connection.status === "actionRequired" ? "Continue on" : "Connect"}
            disabled={action === null}
            onClick={action?.onConnect}
            // The wordmark's box leaves room for the "p" below the line, so it
            // reads high next to the label; this lines it up.
            className="self-start sm:self-auto [&_svg]:translate-y-0.5"
          />
        )}
      </div>
      {action?.error ? (
        <p role="alert" className="text-body-sm text-red-700">
          {action.error}
        </p>
      ) : null}
    </section>
  );
}
