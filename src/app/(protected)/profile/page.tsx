import type { Metadata } from "next";
import { ProfileContent } from "@/features/profile/components/profile-content";

export const metadata: Metadata = { title: "Profile · Tomoji" };

export default function ProfilePage() {
  return (
    <div className="flex-1 bg-muted/40">
      <div className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
          <p className="text-sm text-muted-foreground">Your creator details and portfolio.</p>
        </div>
        <ProfileContent />
      </div>
    </div>
  );
}
