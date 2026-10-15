"use client";

import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { CreatorApplications } from "./creator-applications";

/** Picks the applications view for the signed-in user's role. */
export function ApplicationsView() {
  const { isAuthenticated } = useConvexAuth();
  // users.me requires an identity, so wait until Convex has the token.
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  if (me === undefined) {
    return (
      <>
        <div aria-hidden className="h-10 w-56 animate-pulse rounded-md bg-muted" />
        <span className="sr-only" role="status">
          Loading…
        </span>
      </>
    );
  }

  if (!me.synced) {
    return (
      <p role="status" className="text-muted-foreground">
        We&apos;re finishing setting up your account. This usually takes a few seconds.
      </p>
    );
  }

  if (me.role !== "creator") {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Applications</h1>
        <p className="text-muted-foreground">This page lists a creator&apos;s own applications.</p>
      </div>
    );
  }

  return <CreatorApplications />;
}
