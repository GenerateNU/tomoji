"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { cn } from "cn";
import { api } from "@convex/_generated/api";
import { buttonVariants } from "@/components/ui/button";
import { useCountryName } from "../hooks/use-country-name";
import { parseGithubLink } from "../lib/github-link";
import { parseAdditionalLinks, parseLinkedinLink } from "../lib/links";
import { ExternalLink } from "./external-link";
import { ProfilePicture } from "./profile-picture";
import { ProfileSkeleton } from "./profile-skeleton";

export function CreatorProfile() {
  const profile = useQuery(api.creators.me, {});
  const countryName = useCountryName(profile?.countryOfResidence);
  if (profile === undefined) return <ProfileSkeleton />;

  // Older accounts may use their email as a name fallback; keep it in Settings.
  const name = [profile.firstName, profile.lastName]
    .map((part) => part.trim())
    .filter((part) => part && part.toLowerCase() !== profile.email.trim().toLowerCase())
    .join(" ");
  const github = parseGithubLink(profile.githubLink ?? "");
  const linkedin = parseLinkedinLink(profile.linkedinLink ?? "");
  // The API does not URL-validate saved links, so never render an unsafe one.
  const otherLinks = profile.additionalLinks.filter((link) => parseAdditionalLinks([link]).ok);

  return (
    <div className="space-y-6">
      <section
        aria-label="Creator details"
        className="flex flex-col gap-6 rounded-2xl bg-card p-6 sm:p-8"
      >
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <ProfilePicture mediaId={profile.profilePictureMediaId} />
          <div className="min-w-0 flex-1 space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight wrap-anywhere">
              {name || "Your profile"}
            </h2>
            {countryName !== undefined && (
              <p className="text-sm text-muted-foreground">{countryName}</p>
            )}
          </div>
          <Link
            href="/settings"
            className={cn(buttonVariants({ variant: "outline" }), "min-h-11 self-start px-4")}
          >
            Edit profile
          </Link>
        </div>
      </section>
      <section
        aria-labelledby="profile-github-heading"
        className="space-y-4 rounded-2xl bg-card p-6 sm:p-8"
      >
        <h2 id="profile-github-heading" className="text-xl font-semibold tracking-tight">
          GitHub profile
        </h2>
        {github.ok && github.value ? (
          <ExternalLink href={github.value} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {github.ok
              ? "No GitHub profile added yet."
              : "Your saved GitHub link needs updating. Edit your profile to add a valid URL."}
          </p>
        )}
      </section>
      <section
        aria-labelledby="profile-links-heading"
        className="space-y-4 rounded-2xl bg-card p-6 sm:p-8"
      >
        <h2 id="profile-links-heading" className="text-xl font-semibold tracking-tight">
          Links
        </h2>
        {linkedin.ok && linkedin.value ? (
          <ExternalLink href={linkedin.value} />
        ) : (
          <p className="text-sm text-muted-foreground">
            {linkedin.ok
              ? "No LinkedIn profile added yet."
              : "Your saved LinkedIn link needs updating. Edit your profile to add a valid URL."}
          </p>
        )}
        {otherLinks.length > 0 && (
          <ul className="space-y-2">
            {otherLinks.map((link) => (
              <li key={link} className="min-w-0">
                <ExternalLink href={link} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
