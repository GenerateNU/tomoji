"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { Avatar, getInitials } from "@/components/ui/avatar";
import { useMe } from "@/features/users/hooks/use-me";
import { VideoSkeleton } from "./video-preview";

/** Shows the creator’s submitted or in-progress X content. */
export function SubmissionPreview({
  caption,
  children,
  placeholder = false,
}: {
  caption?: string;
  children?: ReactNode;
  placeholder?: boolean;
}) {
  const me = useMe();
  const account = useQuery(api.xAccounts.me);
  const name = (me?.synced && [me.firstName, me.lastName].filter(Boolean).join(" ")) || "You";

  return (
    <div className="space-y-4 rounded-lg bg-gray-0 p-4 shadow-raised">
      <div className="flex items-center gap-2.5">
        <span aria-hidden>
          <Avatar size={48} initials={getInitials(name)} />
        </span>
        <div className="min-w-0">
          <p className="text-body-lg font-medium wrap-anywhere">{name}</p>
          {account?.username && (
            <p className="text-body-sm wrap-anywhere text-gray-500">@{account.username}</p>
          )}
        </div>
      </div>
      {caption?.trim() ? (
        <p className="text-body-sm break-words whitespace-pre-wrap">{caption}</p>
      ) : (
        placeholder && (
          <div className="space-y-1.5" aria-hidden>
            <div className="h-3 rounded-full bg-gray-50" />
            <div className="h-3 w-[54%] rounded-full bg-gray-50" />
          </div>
        )
      )}
      {children ?? (placeholder && <VideoSkeleton />)}
    </div>
  );
}
