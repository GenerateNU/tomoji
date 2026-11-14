"use client";

import { useEffect, useState } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { errorCode, errorMessage } from "@/lib/errors";

type ImageBytes = { contentType: string; bytes: ArrayBuffer };
type GetImage = (args: { mediaId: Id<"mediaUploads"> }) => Promise<ImageBytes>;

type ImageResult = {
  mediaId: Id<"mediaUploads">;
  attempt: number;
  url?: string;
  error?: string;
};

type PrivateImageOptions = {
  /** Keep one blob URL per media for the life of the page, shared by every reader. */
  shared?: boolean;
  /** Copy for a failed load; `fallback` covers anything without a more specific message. */
  messages?: { fallback: string; upstream_failure?: string; invalid_state?: string };
};

const DEFAULT_MESSAGES = { fallback: "We couldn't load this image." };

// Shared images are fetched once per media, however many rows show them. They
// are never revoked: a handful of small logos is cheaper than refetching them.
const sharedUrls = new Map<Id<"mediaUploads">, Promise<string>>();

/** Decodes the bytes before returning, so the image never flashes in half loaded. */
async function loadImageUrl(
  getImage: GetImage,
  mediaId: Id<"mediaUploads">,
  onUrl?: (url: string) => void,
): Promise<string> {
  const image = await getImage({ mediaId });
  const url = URL.createObjectURL(new Blob([image.bytes], { type: image.contentType }));
  onUrl?.(url);
  try {
    const element = new window.Image();
    element.src = url;
    await element.decode();
    return url;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * Private images arrive as bytes through a Convex action, because S3 never
 * gives the browser read access. Unless `shared`, each blob URL belongs to this
 * mounted reader and is revoked when it unmounts.
 */
export function usePrivateImage(
  mediaId: Id<"mediaUploads"> | undefined,
  getImage: GetImage,
  { shared = false, messages = DEFAULT_MESSAGES }: PrivateImageOptions = {},
) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<ImageResult>();

  useEffect(() => {
    if (!mediaId) return;
    const requestedMediaId = mediaId;
    let cancelled = false;
    let ownedUrl: string | undefined;
    async function load() {
      try {
        let url: string;
        if (shared) {
          let pending = sharedUrls.get(requestedMediaId);
          if (!pending || attempt > 0) {
            const created = loadImageUrl(getImage, requestedMediaId);
            pending = created;
            sharedUrls.set(requestedMediaId, created);
            // A failed load is not cached, so the next reader tries again.
            created.catch(() => {
              if (sharedUrls.get(requestedMediaId) === created) sharedUrls.delete(requestedMediaId);
            });
          }
          url = await pending;
        } else {
          url = await loadImageUrl(getImage, requestedMediaId, (created) => {
            ownedUrl = created;
            if (cancelled) URL.revokeObjectURL(created);
          });
        }
        if (!cancelled) setResult({ mediaId: requestedMediaId, attempt, url });
      } catch (error) {
        if (!cancelled)
          setResult({
            mediaId: requestedMediaId,
            attempt,
            error: errorCode(error)
              ? errorMessage(error, {
                  upstream_failure: messages.upstream_failure ?? messages.fallback,
                  invalid_state: messages.invalid_state ?? messages.fallback,
                })
              : messages.fallback,
          });
      }
    }
    void load();
    return () => {
      cancelled = true;
      if (ownedUrl) URL.revokeObjectURL(ownedUrl);
    };
  }, [mediaId, attempt, getImage, shared, messages]);

  const current = result?.mediaId === mediaId && result?.attempt === attempt ? result : undefined;
  return {
    url: current?.url,
    error: current?.error,
    loading: Boolean(mediaId && !current),
    retry: () => setAttempt((value) => value + 1),
  };
}
