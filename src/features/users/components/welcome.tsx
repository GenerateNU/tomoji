"use client";

import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";

/** Shows the synced identity and company entry points without requesting company data. */
export function Welcome() {
  const { isAuthenticated } = useConvexAuth();
  // users.me requires an identity, so wait until Convex has the token.
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  if (me === undefined) {
    return (
      <>
        <div aria-hidden className="h-8 w-56 animate-pulse rounded-md bg-muted" />
        <span className="sr-only" role="status">
          Loading…
        </span>
      </>
    );
  }

  if (!me.synced) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
        <p role="status" className="text-sm text-muted-foreground">
          We&apos;re finishing setting up your account. This usually takes a few seconds.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">
        {me.firstName ? `Welcome, ${me.firstName}` : "Welcome"}
      </h1>
      {me.role === "company" && (
        <Link
          href="/campaigns"
          className="inline-flex min-h-11 items-center rounded-md underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          View campaigns
        </Link>
      )}
    </div>
  );
}
