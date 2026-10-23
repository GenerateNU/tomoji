import type { Metadata } from "next";
import { SettingsContent } from "@/features/profile/components/settings-content";

export const metadata: Metadata = { title: "Settings · Tomoji" };

export default function SettingsPage() {
  return (
    <div className="flex-1 bg-muted/40">
      <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage your basic details, profile picture, and GitHub profile.
          </p>
        </div>
        <SettingsContent />
      </div>
    </div>
  );
}
