"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { GithubLinkSection } from "./github-link-section";
import { ProfilePictureSection } from "./profile-picture-section";
import { XAccountSection } from "./x-account-section";

export function SettingsContent() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  if (!isLoading && !isAuthenticated) {
    return (
      <p className="text-sm text-muted-foreground">
        Please{" "}
        <Link href="/login?next=%2Fsettings" className="underline underline-offset-4">
          sign in
        </Link>{" "}
        to manage your settings.
      </p>
    );
  }
  if (me === undefined) return <SettingsSkeleton />;
  if (!me.synced) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        We&apos;re finishing setting up your account. Your settings will appear here shortly.
      </p>
    );
  }
  if (me.role !== "creator") {
    return (
      <p className="text-sm text-muted-foreground">
        Profile settings are currently available for creator accounts.
      </p>
    );
  }

  return <CreatorSettings key={me.userId} />;
}

function CreatorSettings() {
  const profile = useQuery(api.creators.me, {});
  if (profile === undefined) return <SettingsSkeleton />;

  return (
    <div className="space-y-6">
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

function SettingsSkeleton() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Loading settings…</span>
      {[0, 1].map((section) => (
        <div key={section} aria-hidden className="space-y-6 rounded-2xl bg-card p-6 sm:p-8">
          <div className="h-6 w-36 animate-pulse rounded bg-muted" />
          <div className="h-24 animate-pulse rounded-xl bg-muted" />
        </div>
      ))}
    </div>
  );
}
