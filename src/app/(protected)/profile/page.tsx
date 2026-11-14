import type { Metadata } from "next";
import { ProfileContent } from "@/features/profile/components/profile-content";

export const metadata: Metadata = { title: "Profile · Tomoji" };

export default function ProfilePage() {
  return (
    <div className="flex-1 bg-gray-0 px-5 py-8 sm:px-10 sm:py-12 lg:px-16 lg:py-16">
      <div className="w-full max-w-[818px] space-y-8">
        <h1 className="font-heading text-heading-lg font-medium">Profile</h1>
        <div className="rounded-lg shadow-card">
          <ProfileContent />
        </div>
      </div>
    </div>
  );
}
