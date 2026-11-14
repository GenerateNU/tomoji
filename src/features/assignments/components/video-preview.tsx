"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Reserves space for a video in the post preview. */
export function VideoSkeleton({ loading = false }: { loading?: boolean }) {
  return (
    <div
      className="aspect-video w-full rounded-lg bg-gray-50"
      role={loading ? "status" : undefined}
      aria-label={loading ? "Loading video" : undefined}
      aria-hidden={loading ? undefined : true}
    />
  );
}

/** Shows the placeholder until the video can display a frame. */
export function VideoPreview({
  url,
  label,
  onError,
}: {
  url: string;
  label: string;
  onError?: () => void;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed)
    return (
      <p className="text-body-sm text-gray-700" role="status">
        Couldn’t preview this video.
      </p>
    );

  return (
    <div className="relative">
      {!ready && <VideoSkeleton loading />}
      <video
        aria-label={label}
        src={url}
        controls={ready}
        preload="auto"
        playsInline
        className={cn(
          "aspect-video w-full rounded-lg bg-gray-950 object-contain",
          !ready && "invisible absolute inset-0",
        )}
        onLoadedData={() => setReady(true)}
        onCanPlay={() => setReady(true)}
        onSuspend={({ currentTarget: video }) => {
          // Browsers that stop at metadata still need to expose the play button.
          if (video.readyState >= video.HAVE_METADATA) setReady(true);
        }}
        onError={() => {
          if (onError) onError();
          else setFailed(true);
        }}
      />
    </div>
  );
}
