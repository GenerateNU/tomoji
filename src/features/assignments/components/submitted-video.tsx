"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/** Requests a fresh private video URL on intent and lets the creator retry playback. */
export function SubmittedVideo({
  mediaId,
  eager = false,
}: {
  mediaId: Id<"mediaUploads">;
  eager?: boolean;
}) {
  const getVideoUrl = useAction(api.media.getVideoUrl);
  const [url, setUrl] = useState<string>();
  const [state, setState] = useState<"loading" | "error" | "ready">(eager ? "loading" : "ready");
  useEffect(() => {
    if (state !== "loading") return;
    let stale = false;
    void getVideoUrl({ mediaId }).then(
      ({ url }) => {
        if (stale) return;
        setUrl(url);
        setState("ready");
      },
      () => {
        if (!stale) setState("error");
      },
    );
    return () => {
      stale = true;
    };
  }, [getVideoUrl, mediaId, state]);
  if (url)
    return (
      <video
        aria-label="Submitted video"
        src={url}
        controls
        preload="auto"
        playsInline
        className="aspect-video w-full rounded bg-gray-950"
        onError={() => {
          setUrl(undefined);
          setState("error");
        }}
      />
    );
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={state === "loading"}
        onClick={() => setState("loading")}
      >
        {state === "loading"
          ? "Loading video…"
          : state === "error"
            ? "Retry video"
            : "View submitted video"}
      </Button>
      {state === "error" && <p role="alert">Couldn’t load this video. Try again.</p>}
    </>
  );
}
