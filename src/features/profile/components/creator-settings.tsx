"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import Link from "next/link";
import type { ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStripeOnboarding } from "@/features/stripe/hooks/use-stripe-onboarding";
import { GeneralSettingsSection } from "./general-settings-section";
import { PaymentSettingsCard, type PaymentConnection } from "./payment-settings-card";
import { SettingsSkeleton } from "./settings-skeleton";

export function CreatorSettings() {
  const profile = useQuery(api.creators.me, {});
  if (profile === undefined) return <SettingsSkeleton />;

  return (
    <Tabs defaultValue="payment" className="gap-8 sm:gap-11">
      <TabsList aria-label="Settings">
        <TabsTrigger value="payment">Payment</TabsTrigger>
        <TabsTrigger value="general">General</TabsTrigger>
      </TabsList>
      <TabsContent value="payment">
        <StripeConnection />
      </TabsContent>
      <TabsContent value="general" keepMounted>
        <GeneralSettingsSection key={profile.email} email={profile.email} />
      </TabsContent>
    </Tabs>
  );
}

/** The Payment card for the creator's Stripe account; Stripe sends them back here. */
function StripeConnection() {
  const { status, connect, pending, error } = useStripeOnboarding("/settings");
  const action = {
    onConnect: () => void connect(),
    error:
      error === "country" ? (
        <>
          Add your country on your{" "}
          <Link href="/profile" className="underline underline-offset-4">
            profile
          </Link>{" "}
          first. Stripe uses it to set up your account.
        </>
      ) : (
        (error ?? undefined)
      ),
  };

  const connection = pending ? { status: "connecting" as const } : toConnection(status, action);

  return <PaymentSettingsCard connection={connection} />;
}

/** Maps the account's Stripe status onto the card's states. */
function toConnection(
  status: ReturnType<typeof useStripeOnboarding>["status"],
  action: { onConnect: () => void; error?: ReactNode },
): PaymentConnection {
  switch (status) {
    case undefined:
      return { status: "unavailable" };
    case "ready":
      return { status: "connected" };
    case "inReview":
    case "rejected":
      return { status };
    case "actionRequired":
      return { status: "actionRequired", ...action };
    case "disconnected":
      return { status: "removed", ...action };
    case "notStarted":
      return { status: "disconnected", ...action };
  }
}
