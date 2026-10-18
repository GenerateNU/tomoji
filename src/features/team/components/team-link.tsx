"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

/** Shows company navigation only after the authoritative account has synced. */
export function TeamLink() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  if (!me?.synced || me.role !== "company") return null;
  return (
    <Link
      href="/team/invites"
      className="inline-flex min-h-11 items-center rounded-md text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      Workspace members
    </Link>
  );
}
