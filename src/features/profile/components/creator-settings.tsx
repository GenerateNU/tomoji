"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { BasicDetailsSection } from "./basic-details-section";
import { GithubLinkSection } from "./github-link-section";
import { ProfilePictureSection } from "./profile-picture-section";
import { XAccountSection } from "./x-account-section";
import { SettingsSkeleton } from "./settings-skeleton";

export function CreatorSettings() {
  const profile = useQuery(api.creators.me, {});
  if (profile === undefined) return <SettingsSkeleton />;

  return (
    <div className="space-y-6">
      <BasicDetailsSection />
      <ProfilePictureSection mediaId={profile.profilePictureMediaId} />
      <section aria-label="Portfolio" className="space-y-6 rounded-2xl bg-card p-6 sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight">Portfolio</h2>
        <div className="grid gap-6 md:grid-cols-2">
          <XAccountSection />
          <GithubLinkSection githubLink={profile.githubLink} />
        </div>
      </section>
    </div>
  );
}
