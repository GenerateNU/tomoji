"use client";

import { useId } from "react";
import { BrandButton } from "@/components/brand-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type PaymentConnection =
  | { status: "unavailable" }
  | { status: "disconnected"; onConnect: () => void; error?: string }
  | { status: "connecting" }
  | { status: "connected" };

/** Connection states are supplied by the payment integration; this card never invents success. */
export function PaymentSettingsCard({
  connection = { status: "unavailable" },
}: {
  connection?: PaymentConnection;
}) {
  const headingId = useId();
  const connected = connection.status === "connected";
  const unavailable = connection.status === "unavailable";

  return (
    <section
      aria-labelledby={headingId}
      className="w-full max-w-[34rem] space-y-3 rounded-lg bg-card p-5 shadow-card"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h2 id={headingId} className="text-body font-medium">
            {connected ? "Stripe connected" : "Connect your Stripe account"}
          </h2>
          <p className="text-body-sm text-muted-foreground">
            {connected
              ? "Payouts go straight to the bank account on your Stripe account."
              : "This is how money gets into your bank account."}
          </p>
        </div>
        {connected ? (
          <Badge tone="primary" size="md" role="status">
            Connected
          </Badge>
        ) : connection.status === "connecting" ? (
          <Button disabled aria-busy="true" className="self-start sm:self-auto">
            Connecting…
          </Button>
        ) : (
          <BrandButton
            brand="stripe"
            variant="primary"
            disabled={unavailable}
            onClick={connection.status === "disconnected" ? connection.onConnect : undefined}
            className="self-start sm:self-auto"
          />
        )}
      </div>
      {connection.status === "disconnected" && connection.error ? (
        <p role="alert" className="text-body-sm text-red-700">
          {connection.error}
        </p>
      ) : null}
    </section>
  );
}
