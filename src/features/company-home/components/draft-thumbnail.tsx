"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

/** Loads at most four private metadata previews; missing or failed media keeps the Figma placeholder. */
export function DraftThumbnail({ mediaId }: { mediaId: Id<"mediaUploads"> | null }) {
  const getVideoUrl = useAction(api.media.getVideoUrl);
  const [preview, setPreview] = useState<{ mediaId: Id<"mediaUploads">; url: string }>();
  const [failed, setFailed] = useState<Id<"mediaUploads">>();
  useEffect(() => {
    if (!mediaId) return;
    let cancelled = false;
    void getVideoUrl({ mediaId }).then(
      (result) => {
        if (!cancelled) setPreview({ mediaId, url: result.url });
      },
      () => {
        if (!cancelled) setFailed(mediaId);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [getVideoUrl, mediaId]);
  return (
    <span aria-hidden className="block h-21.5 w-full overflow-hidden rounded-lg bg-gray-50">
      {mediaId && failed !== mediaId && preview?.mediaId === mediaId && (
        <video
          src={preview.url}
          muted
          playsInline
          preload="metadata"
          className="size-full object-cover"
          onError={() => setFailed(mediaId)}
        />
      )}
    </span>
  );
}
