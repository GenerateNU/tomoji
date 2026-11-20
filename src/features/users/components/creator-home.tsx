"use client";

import { RecommendedOpportunities } from "@/features/opportunities/components/recommended-opportunities";
import { ProfileCompletionCard } from "@/features/profile/components/profile-completion-card";

/**
 * The creator landing page: a nudge to finish the profile until it is
 * complete, then the opportunities that match them best. Page padding
 * matches the Opportunities feed.
 */
export function CreatorHome() {
  return (
    <div className="flex w-full flex-col gap-10 px-4 py-12 sm:px-10 lg:px-16 lg:py-16">
      <h1 className="text-heading-lg text-gray-950">Home</h1>
      <div className="flex flex-col gap-4">
        <ProfileCompletionCard />
        <RecommendedOpportunities />
      </div>
    </div>
  );
}
