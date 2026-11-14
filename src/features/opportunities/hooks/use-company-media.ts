"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";

/**
 * A company's picture or banner as a blob URL, or undefined while it loads or
 * if it can't. Images are decoration on feed cards, so failures just leave the
 * placeholder in place.
 */
export function useCompanyMedia(mediaId?: Id<"mediaUploads">): string | undefined {
  const getMedia = useAction(api.media.getCompanyMedia);
  const [loaded, setLoaded] = useState<{ mediaId: Id<"mediaUploads">; url: string }>();

  useEffect(() => {
    if (!mediaId) return;
    let cancelled = false;
    let url: string | undefined;
    getMedia({ mediaId })
      .then((media) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([media.bytes], { type: media.contentType }));
        setLoaded({ mediaId, url });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [mediaId, getMedia]);

  return loaded !== undefined && loaded.mediaId === mediaId ? loaded.url : undefined;
}
