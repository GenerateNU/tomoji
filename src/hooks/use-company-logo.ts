"use client";

import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { usePrivateImage } from "@/hooks/use-private-image";

/**
 * A company's logo as a blob URL, or no `url` while it loads or if it can't be
 * read (e.g. the company went inactive), so callers show initials instead.
 * One fetch per logo is shared by every row of the same company.
 */
export function useCompanyLogo(mediaId?: Id<"mediaUploads">) {
  const getCompanyMedia = useAction(api.media.getCompanyMedia);
  return usePrivateImage(mediaId, getCompanyMedia, { shared: true });
}
