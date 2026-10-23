"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { cn } from "cn";
import { ExternalLink } from "lucide-react";
import { api } from "@convex/_generated/api";
import { buttonVariants } from "@/components/ui/button";
import { parseGithubLink } from "../lib/github-link";
import { ProfilePicture } from "./profile-picture";
import { ProfileSkeleton } from "./profile-skeleton";

export function CreatorProfile() {
  const profile = useQuery(api.creators.me, {});
  if (profile === undefined) return <ProfileSkeleton />;

  // Older accounts may use their email as a name fallback; keep it in Settings.
  const name = [profile.firstName, profile.lastName]
    .map((part) => part?.trim())
    .filter((part) => part && part.toLowerCase() !== profile.email.trim().toLowerCase())
    .join(" ");
  const username = profile.username?.trim();
  const github = parseGithubLink(profile.githubLink ?? "");

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
            <p className="text-sm text-muted-foreground wrap-anywhere">
              {username ? `@${username}` : "Username not added yet."}
            </p>
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
          <a
            href={github.value}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex max-w-full items-center gap-2 rounded text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <span className="min-w-0 wrap-anywhere">{github.value}</span>
            <ExternalLink aria-hidden className="size-4 shrink-0" />
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <p className="text-sm text-muted-foreground">
            {github.ok
              ? "No GitHub profile added yet."
              : "Your saved GitHub link needs updating. Edit your profile to add a valid URL."}
          </p>
        )}
      </section>
    </div>
  );
}
