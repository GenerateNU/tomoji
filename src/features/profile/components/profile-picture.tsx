"use client";

import Image from "next/image";
import { UserRound } from "lucide-react";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { useProfilePicture } from "../hooks/use-profile-picture";

export function ProfilePicture({ mediaId }: { mediaId?: Id<"mediaUploads"> }) {
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
          <Button variant="secondary" className="min-h-11" onClick={picture.retry}>
            Retry picture
          </Button>
        </div>
      )}
      {!mediaId && <p className="text-sm text-muted-foreground">No profile picture added.</p>}
    </div>
  );
}
