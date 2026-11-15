import type { Metadata } from "next";
import { SettingsContent } from "@/features/profile/components/settings-content";

export const metadata: Metadata = { title: "Settings · Tomoji" };

export default function SettingsPage() {
  return (
    <div className="flex-1 bg-background">
      <div className="w-full space-y-10 px-4 py-8 sm:px-8 sm:py-10 lg:px-16 lg:py-16">
        <h1 className="text-heading-md">Settings</h1>
        <SettingsContent />
      </div>
    </div>
  );
}
