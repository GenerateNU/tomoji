"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { Spinner } from "@/components/spinner";
import { SignedOutNotice } from "@/features/auth/components/signed-out-notice";
import { useMe } from "@/features/users/hooks/use-me";
import { OnboardingDraftProvider } from "../hooks/use-onboarding-draft";
import type { OnboardingSlug } from "../lib/steps";
import { BasicInfoStep } from "./basic-info-step";
import { ConnectXStep } from "./connect-x-step";
import { ContentStep } from "./content-step";
import { PortfolioStep } from "./portfolio-step";

/** The saved profile as `MM/DD/YYYY`, so the field opens on what was stored. */
function toBirthdateField(timestamp: number | undefined): string {
  if (timestamp === undefined) return "";
  const date = new Date(timestamp);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${month}/${day}/${date.getUTCFullYear()}`;
}

function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-0">
      <Spinner size={32} label="Loading" />
    </div>
  );
}

/**
 * Loads the profile once for whichever step is showing and seeds the draft
 * from it, so a creator who leaves halfway and comes back sees what they
 * already entered. Creators who have finished are sent to the app.
 */
export function OnboardingFlow({ slug }: { slug: OnboardingSlug }) {
  const router = useRouter();
  const me = useMe();
  const profile = useQuery(api.creators.me, me?.synced && me.role === "creator" ? {} : "skip");
  const xAccount = useQuery(api.xAccounts.me, me?.synced && me.role === "creator" ? {} : "skip");

  const finished = profile?.onboardingCompletedAt !== undefined;
  useEffect(() => {
    if (finished) router.replace("/");
  }, [finished, router]);

  // Only creators onboard; anyone else belongs on the app's own pages.
  useEffect(() => {
    if (me !== undefined && me !== null && me.synced && me.role !== "creator") router.replace("/");
  }, [me, router]);

  if (me === null) return <SignedOutNotice next={`/onboarding/${slug}`} />;
  if (me === undefined || !me.synced || me.role !== "creator") return <Loading />;
  if (profile === undefined || xAccount === undefined || finished) return <Loading />;

  const name = `${profile.firstName} ${profile.lastName}`.trim() || profile.email;
  const shared = {
    name,
    joinedAt: profile.joinedAt,
    xUsername: xAccount?.username ?? null,
    pictureMediaId: profile.profilePictureMediaId,
  };

  return (
    <OnboardingDraftProvider
      initial={{
        birthdate: toBirthdateField(profile.dateOfBirth),
        countryOfResidence: profile.countryOfResidence ?? "",
        languages: profile.languages,
        niches: profile.niches,
        skills: profile.skills,
        githubLink: profile.githubLink ?? "",
        linkedinLink: profile.linkedinLink ?? "",
        additionalLinks: profile.additionalLinks,
      }}
    >
      {slug === "connect-x" && <ConnectXStep alreadyConnected={shared.xUsername !== null} />}
      {slug === "basic-info" && <BasicInfoStep {...shared} />}
      {slug === "content" && <ContentStep {...shared} />}
      {slug === "portfolio" && <PortfolioStep {...shared} />}
    </OnboardingDraftProvider>
  );
}
