"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { RiFileLine } from "@remixicon/react";
import { useAction } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Shows the media references attached by the company to this deliverable. */
export function AssignmentExamples({
  deliverableId,
  mediaIds,
}: {
  deliverableId: Id<"deliverables">;
  mediaIds: Id<"mediaUploads">[];
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-body-sm font-medium text-gray-500">Examples</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {mediaIds.map((mediaId, index) => (
          <AssignmentExample
            key={mediaId}
            deliverableId={deliverableId}
            mediaId={mediaId}
            label={`Example ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

/** Loads a private example only when the creator opens it. */
function AssignmentExample({
  deliverableId,
  mediaId,
  label,
}: {
  deliverableId: Id<"deliverables">;
  mediaId: Id<"mediaUploads">;
  label: string;
}) {
  const getExample = useAction(api.media.getDeliverableExample);
  const mounted = useRef(false);
  const [file, setFile] = useState<{ url: string; image: boolean }>();
  const [state, setState] = useState<"loading" | "error">();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (file) return () => URL.revokeObjectURL(file.url);
  }, [file]);

  async function loadExample() {
    setState("loading");
    try {
      const { bytes, contentType } = await getExample({ deliverableId, mediaId });
      if (!mounted.current) return;
      setFile({
        url: URL.createObjectURL(new Blob([bytes], { type: contentType })),
        image: contentType.startsWith("image/"),
      });
      setState(undefined);
    } catch {
      if (mounted.current) setState("error");
    }
  }

  return (
    <div className="flex min-h-24 min-w-0 flex-col items-center justify-center gap-2 rounded-md bg-gray-50 p-2">
      {file ? (
        <a href={file.url} target="_blank" rel="noreferrer" className="text-body-xs underline">
          {file.image ? (
            // Blob URLs are created after authorized media reads in the browser.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.url} alt={label} className="max-h-40 rounded-sm object-contain" />
          ) : (
            `Open ${label.toLowerCase()}`
          )}
        </a>
      ) : (
        <Button
          size="sm"
          type="button"
          variant="secondary-ghost"
          className="max-w-full"
          onClick={loadExample}
          disabled={state === "loading"}
        >
          <RiFileLine aria-hidden />
          {state === "loading" ? "Loading…" : label}
        </Button>
      )}
      {state === "error" && (
        <p role="alert" className="text-body-xs text-red-700">
          Try again.
        </p>
      )}
    </div>
  );
}
