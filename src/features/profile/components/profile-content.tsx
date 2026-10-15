"use client";

import Image from "next/image";
import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { cn } from "cn";
import { ExternalLink, UserRound } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button, buttonVariants } from "@/components/ui/button";
import { useProfilePicture } from "../hooks/use-profile-picture";
import { parseGithubLink } from "../lib/github-link";

export function ProfileContent() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, !isLoading && isAuthenticated ? {} : "skip");

  if (isLoading) return <ProfileSkeleton />;
  if (!isAuthenticated) {
    return (
      <p className="text-sm text-muted-foreground">
        Please{" "}
        <Link
          href="/login?next=%2Fprofile"
          className="rounded underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          sign in
        </Link>{" "}
        to view your profile.
      </p>
    );
  }
  if (me === undefined) return <ProfileSkeleton />;
  if (!me.synced) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        We’re finishing setting up your account. Your profile will appear here shortly.
      </p>
    );
  }
  if (me.role !== "creator") {
    return (
      <p className="text-sm text-muted-foreground">
        Creator profiles are currently available for creator accounts.
      </p>
    );
  }

  return <CreatorProfile key={me.userId} />;
}

function CreatorProfile() {
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

function ProfilePicture({ mediaId }: { mediaId?: Id<"mediaUploads"> }) {
  const picture = useProfilePicture(mediaId);

  return (
    <div className="w-40 shrink-0 space-y-3">
      <div className="relative flex size-28 items-center justify-center overflow-hidden rounded-full bg-muted">
        {picture.url ? (
          <Image
            src={picture.url}
            alt="Your profile picture"
            fill
            unoptimized
            sizes="112px"
            className="object-cover"
          />
        ) : (
          <UserRound aria-hidden className="size-12 text-muted-foreground" />
        )}
      </div>
      {picture.loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading picture…
        </p>
      )}
      {picture.error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {picture.error}
          </p>
          <Button variant="outline" className="min-h-11" onClick={picture.retry}>
            Retry picture
          </Button>
        </div>
      )}
      {!mediaId && <p className="text-sm text-muted-foreground">No profile picture added.</p>}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Loading profile…</span>
      <div aria-hidden className="flex flex-wrap gap-6 rounded-2xl bg-card p-6 sm:p-8">
        <div className="size-28 animate-pulse rounded-full bg-muted" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="h-7 w-48 max-w-full animate-pulse rounded bg-muted" />
          <div className="h-5 w-28 max-w-full animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div aria-hidden className="space-y-4 rounded-2xl bg-card p-6 sm:p-8">
        <div className="h-6 w-36 animate-pulse rounded bg-muted" />
        <div className="h-5 w-64 max-w-full animate-pulse rounded bg-muted" />
      </div>
    </div>
  );
}
