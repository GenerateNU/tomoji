"use client";

import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import { CreatorFeed } from "./creator-feed";

/**
 * `/opportunities` serves every role (see docs/FRONTEND.md). Creators get the
 * discovery feed; the company view is a separate ticket.
 */
export function OpportunitiesPage() {
  const { isAuthenticated } = useConvexAuth();
  // users.me requires an identity, so wait until Convex has the token.
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  if (me === undefined) {
    return (
      <>
        <div aria-hidden className="m-10 h-10 w-48 animate-pulse rounded-lg bg-muted" />
        <span className="sr-only" role="status">
          Loading…
        </span>
      </>
    );
  }
  if (!me.synced) {
    return (
      <p role="status" className="p-10 text-sm text-muted-foreground">
        We&apos;re finishing setting up your account. This usually takes a few seconds.
      </p>
    );
  }
  if (me.role !== "creator") {
    return (
      <p className="p-10">The opportunities view for your account type isn&apos;t available yet.</p>
    );
  }
  return <CreatorFeed />;
}
