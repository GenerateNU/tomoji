"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { errorCode, errorMessage } from "@/lib/errors";

type PictureResult = {
  mediaId: Id<"mediaUploads">;
  attempt: number;
  url?: string;
  error?: string;
};

/** Private images arrive as bytes; each blob URL belongs to this mounted reader. */
export function useProfilePicture(mediaId?: Id<"mediaUploads">) {
  const getPicture = useAction(api.media.getProfilePicture);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<PictureResult>();

  useEffect(() => {
    if (!mediaId) return;
    const requestedMediaId = mediaId;
    let cancelled = false;
    let url: string | undefined;
    async function load() {
      try {
        const picture = await getPicture({ mediaId: requestedMediaId });
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([picture.bytes], { type: picture.contentType }));
        const image = new window.Image();
        image.src = url;
        await image.decode();
        if (!cancelled) setResult({ mediaId: requestedMediaId, attempt, url });
      } catch (error) {
        if (url) URL.revokeObjectURL(url);
        url = undefined;
        if (!cancelled)
          setResult({
            mediaId: requestedMediaId,
            attempt,
            error: errorCode(error)
              ? errorMessage(error, {
                  upstream_failure: "We couldn't load your picture. Try again.",
                  invalid_state: "We couldn't load your picture. Try again or choose another one.",
                })
              : "We couldn't load your picture. Try again or choose another one.",
          });
      }
    }
    void load();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [mediaId, attempt, getPicture]);

  const current = result?.mediaId === mediaId && result?.attempt === attempt ? result : undefined;
  return {
    url: current?.url,
    error: current?.error,
    loading: Boolean(mediaId && !current),
    retry: () => setAttempt((value) => value + 1),
  };
}
