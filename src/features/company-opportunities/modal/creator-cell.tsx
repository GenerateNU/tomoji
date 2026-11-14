"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Avatar, getInitials } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";

function Layout({
  avatar,
  name,
  secondary,
}: {
  avatar: ReactNode;
  name: ReactNode;
  secondary?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="shrink-0 max-sm:hidden">{avatar}</span>
      <div className="flex min-w-0 flex-col">
        <span className="truncate font-medium">{name}</span>
        {secondary ? (
          <span className="truncate text-body-xs text-gray-500">{secondary}</span>
        ) : null}
      </div>
    </div>
  );
}

function CreatorName({
  creatorId,
  secondary,
}: {
  creatorId: Id<"creators">;
  secondary?: ReactNode;
}) {
  const creator = useQuery(api.creators.get, { creatorId });
  if (creator === undefined) {
    return (
      <Layout
        avatar={<Skeleton className="size-8 rounded-full" />}
        name={
          <>
            <span className="sr-only">Loading creator…</span>
            <Skeleton className="h-4 w-28" />
          </>
        }
      />
    );
  }
  const name = `${creator.firstName} ${creator.lastName}`.trim() || creator.email;
  return (
    <Layout
      avatar={<Avatar size={32} initials={getInitials(name)} />}
      name={name}
      secondary={secondary}
    />
  );
}

/**
 * A creator's initials and name for a table row. The row's own query has only
 * the creator's id, so each cell reads the profile; Convex shares the
 * subscription between rows for the same creator. A creator the company can no
 * longer see (deactivated, or private) falls back to a placeholder instead of
 * failing the whole table.
 */
export function CreatorCell({
  creatorId,
  secondary,
}: {
  creatorId: Id<"creators">;
  secondary?: ReactNode;
}) {
  return (
    <ErrorBoundary
      key={creatorId}
      fallback={() => (
        <Layout
          avatar={<Avatar size={32} />}
          name={<span className="text-gray-500">Unavailable creator</span>}
          secondary={secondary}
        />
      )}
    >
      <CreatorName creatorId={creatorId} secondary={secondary} />
    </ErrorBoundary>
  );
}
