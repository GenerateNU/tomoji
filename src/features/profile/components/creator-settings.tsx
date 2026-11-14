"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GeneralSettingsSection } from "./general-settings-section";
import { PaymentSettingsCard } from "./payment-settings-card";
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
        <PaymentSettingsCard />
      </TabsContent>
      <TabsContent value="general" keepMounted>
        <GeneralSettingsSection key={profile.email} email={profile.email} />
      </TabsContent>
    </Tabs>
  );
}
