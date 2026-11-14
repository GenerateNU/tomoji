"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { RiFileTextLine, RiRefreshLine } from "@remixicon/react";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

export function DisputeEvidence({
  disputeId,
  mediaIds,
}: {
  disputeId: Id<"disputes">;
  mediaIds: Id<"mediaUploads">[];
}) {
  return (
    <section aria-labelledby="dispute-evidence" className="flex flex-col gap-3">
      <h3 id="dispute-evidence" className="text-body font-medium text-gray-500">
        Evidence
      </h3>
      <ul className="flex flex-wrap gap-2.5">
        {mediaIds.map((mediaId, index) => (
          <li key={mediaId}>
            <EvidenceTile disputeId={disputeId} mediaId={mediaId} label={`File ${index + 1}`} />
          </li>
        ))}
      </ul>
    </section>
  );
}

type Loaded = { url: string; image: boolean };

// The backend doesn't store file names, so tiles are numbered.
function EvidenceTile({
  disputeId,
  mediaId,
  label,
}: {
  disputeId: Id<"disputes">;
  mediaId: Id<"mediaUploads">;
  label: string;
}) {
  const getEvidence = useAction(api.media.getDisputeEvidence);
  const [file, setFile] = useState<Loaded>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let url: string | undefined;
    getEvidence({ disputeId, mediaId }).then(
      ({ bytes, contentType }) => {
        url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
        if (cancelled) URL.revokeObjectURL(url);
        else setFile({ url, image: contentType.startsWith("image/") });
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [getEvidence, disputeId, mediaId, attempt]);

  const tile = "relative flex size-25 overflow-hidden rounded-lg bg-gray-100";
  const caption = (
    <span className="absolute inset-x-1.5 bottom-1.5 truncate text-body-xs text-gray-500">
      {label}
    </span>
  );

  if (failed) {
    return (
      <button
        type="button"
        onClick={() => {
          setFailed(false);
          setAttempt((value) => value + 1);
        }}
        className={cn(tile, "cursor-pointer items-center justify-center", focusRing)}
      >
        <span className="flex flex-col items-center gap-1 text-body-xs text-gray-700">
          <RiRefreshLine {...iconProps} />
          Retry
        </span>
        <span className="sr-only">loading {label}</span>
      </button>
    );
  }
  if (!file) return <Skeleton className="size-25 rounded-lg" aria-label={`Loading ${label}`} />;

  return (
    <a
      href={file.url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${label}`}
      className={cn(tile, focusRing)}
    >
      {file.image ? (
        // A blob URL from an authorized read; next/image can't optimize it.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={file.url} alt="" className="size-full object-cover" />
      ) : (
        <RiFileTextLine size={32} aria-hidden className="m-auto text-gray-500" />
      )}
      {!file.image && caption}
    </a>
  );
}
