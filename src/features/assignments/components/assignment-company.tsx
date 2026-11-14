"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { CompanyAvatar, getInitials } from "@/components/ui/avatar";

/** Loads the company mark through the existing authenticated media endpoint. */
export function AssignmentCompany({
  name,
  mediaId,
}: {
  name: string | null;
  mediaId?: Id<"mediaUploads">;
}) {
  const getMedia = useAction(api.media.getCompanyMedia);
  const [image, setImage] = useState<{ id: Id<"mediaUploads">; url: string }>();
  useEffect(() => {
    if (!mediaId) return;
    let cancelled = false;
    let url: string | undefined;
    void getMedia({ mediaId })
      .then(({ bytes, contentType }) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
        setImage({ id: mediaId, url });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [getMedia, mediaId]);
  if (!name) return null;
  return (
    <span className="flex min-w-0 items-center gap-2 font-medium">
      <CompanyAvatar
        size={24}
        initials={getInitials(name)}
        src={image && image.id === mediaId ? image.url : undefined}
        alt=""
      />
      <span className="truncate">{name}</span>
    </span>
  );
}
