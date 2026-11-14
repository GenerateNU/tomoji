"use client";

import type { FunctionReturnType } from "convex/server";
import { useRef } from "react";
import type { api } from "@convex/_generated/api";
import { RiImageLine } from "@remixicon/react";
import { Avatar, getInitials } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProfilePicture } from "../hooks/use-profile-picture";
import { profileDisplayName } from "../lib/profile-display";
import { PROFILE_PREVIEW } from "../lib/profile-preview";
import { profilePictureTypes } from "../lib/profile-picture";

export function CreatorProfileHeader({
  profile,
  editing = false,
  photo,
}: {
  profile: FunctionReturnType<typeof api.creators.me>;
  editing?: boolean;
  photo?: {
    previewUrl?: string;
    disabled: boolean;
    status?: string;
    error?: string;
    onChoose: (file: File) => void;
  };
}) {
  const name = profileDisplayName(profile);
  const picture = useProfilePicture(profile.profilePictureMediaId);
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <header
      className={cn(
        "shrink-0 space-y-3 px-6 pt-6 pr-12 sm:px-8 sm:pt-8 sm:pr-14",
        editing && "pb-6",
      )}
    >
      <div className="flex items-center gap-4">
        <Avatar
          size={64}
          initials={name === "Your profile" ? undefined : getInitials(name)}
          src={photo?.previewUrl ?? picture.url}
          alt="Your profile picture"
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-3">
          <div className="min-w-0 max-w-full">
            <h2 className="font-heading text-body-lg font-medium wrap-anywhere">{name}</h2>
            <p className="text-body-sm text-gray-500">Joined {PROFILE_PREVIEW.joined}</p>
            {picture.loading && !photo?.previewUrl && (
              <p role="status" className="text-body-sm text-gray-500">
                Loading picture…
              </p>
            )}
          </div>
          {editing && (
            <>
              <input
                ref={fileInput}
                type="file"
                hidden
                accept={profilePictureTypes.join(",")}
                aria-label="Choose profile photo"
                disabled={!photo || photo.disabled}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) photo?.onChoose(file);
                }}
              />
              <Button
                type="button"
                variant="secondary-subtle"
                size="sm"
                icon={RiImageLine}
                disabled={!photo || photo.disabled}
                onClick={() => fileInput.current?.click()}
              >
                Change photo
              </Button>
            </>
          )}
        </div>
      </div>
      {photo?.status && (
        <p role="status" className="text-body-sm text-gray-500">
          {photo.status}
        </p>
      )}
      {photo?.error && (
        <p role="alert" className="text-body-sm text-red-700">
          {photo.error}
        </p>
      )}
      {picture.error && !photo?.previewUrl && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-body-sm text-red-700">
            {picture.error}
          </p>
          <Button type="button" variant="secondary-subtle" size="sm" onClick={picture.retry}>
            Retry picture
          </Button>
        </div>
      )}
    </header>
  );
}
