"use client";

import { RecommendedOpportunities } from "@/features/opportunities/components/recommended-opportunities";
import { ProfileCompletionCard } from "@/features/profile/components/profile-completion-card";

/**
 * The creator landing page: a nudge to finish the profile until it is
 * complete, then the opportunities that match them best.
 */
export function CreatorHome() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-heading-lg font-medium text-gray-950">Home</h1>
      <ProfileCompletionCard />
      <RecommendedOpportunities />
    </div>
  );
}
