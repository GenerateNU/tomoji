"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@convex/_generated/api";
import { useAction } from "convex/react";
import type { Id } from "@convex/_generated/dataModel";
import { RiCameraLine } from "@remixicon/react";
import { Avatar, getInitials } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  createProfilePictureUpload,
  profilePictureTypes,
  validateProfilePicture,
} from "@/features/profile/lib/profile-picture";
import { useProfilePicture } from "@/features/profile/hooks/use-profile-picture";

/**
 * The avatar and its "Change photo" button. The picture uploads as soon as it
 * is chosen, so the step's Continue never waits on a transfer, and the local
 * preview is handed up so the profile preview shows it immediately.
 */
export function OnboardingPicture({
  name,
  mediaId,
  onPreviewChange,
}: {
  name: string;
  mediaId?: string;
  onPreviewChange: (url: string | undefined) => void;
}) {
  const requestUpload = useAction(api.media.requestUpload);
  const completeUpload = useAction(api.media.completeUpload);
  const saved = useProfilePicture(mediaId as Id<"mediaUploads"> | undefined);
  const input = useRef<HTMLInputElement>(null);
  const [localUrl, setLocalUrl] = useState<string>();
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // The object URL belongs to this component, so it is released when the
  // picture is replaced or the step unmounts.
  useEffect(() => {
    return () => {
      if (localUrl !== undefined) URL.revokeObjectURL(localUrl);
    };
  }, [localUrl]);

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file === undefined) return;
    const invalid = validateProfilePicture(file);
    if (invalid !== null) {
      setError(invalid);
      return;
    }
    const preview = URL.createObjectURL(file);
    setLocalUrl(preview);
    onPreviewChange(preview);
    setError(null);
    setPending(true);
    try {
      const upload = createProfilePictureUpload(file, { requestUpload, completeUpload });
      await upload.save((phase) =>
        setStatus(phase === "uploading" ? "Uploading your photo…" : "Saving your photo…"),
      );
      setStatus(null);
    } catch {
      setError("We couldn't upload that photo. Try again.");
      setStatus(null);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <Avatar size={48} initials={getInitials(name)} src={localUrl ?? saved?.url} alt="" />
        <input
          ref={input}
          type="file"
          accept={profilePictureTypes.join(",")}
          aria-label="Choose profile photo"
          hidden
          disabled={pending}
          onChange={(event) => void choose(event)}
        />
        <Button
          type="button"
          variant="secondary-subtle"
          size="sm"
          icon={RiCameraLine}
          disabled={pending}
          onClick={() => input.current?.click()}
        >
          Change photo
        </Button>
      </div>
      {status !== null && (
        <p role="status" className="text-body-sm font-normal text-gray-500">
          {status}
        </p>
      )}
      {error !== null && (
        <p role="alert" className="text-body-sm font-normal text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
