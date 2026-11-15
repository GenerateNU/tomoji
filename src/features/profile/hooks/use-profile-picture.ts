"use client";

import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { usePrivateImage } from "@/hooks/use-private-image";

const FAILURE_MESSAGES = {
  fallback: "We couldn't load your picture. Try again or choose another one.",
  upstream_failure: "We couldn't load your picture. Try again.",
  invalid_state: "We couldn't load your picture. Try again or choose another one.",
};

/** Private images arrive as bytes; each blob URL belongs to this mounted reader. */
export function useProfilePicture(mediaId?: Id<"mediaUploads">) {
  const getPicture = useAction(api.media.getProfilePicture);
  return usePrivateImage(mediaId, getPicture, { messages: FAILURE_MESSAGES });
}
