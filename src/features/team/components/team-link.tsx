"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useConvexAuth, useQueries, type RequestForQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";

/** Shows company navigation only after the authoritative account has synced. */
export function TeamLink() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const queries = useMemo(
    (): RequestForQueries =>
      !isLoading && isAuthenticated ? { me: { query: api.users.me, args: {} } } : {},
    [isLoading, isAuthenticated],
  );
  // Navigation is outside the page error boundary; a failed account query must
  // not prevent signing out or reaching another page.
  const { me }: { me?: FunctionReturnType<typeof api.users.me> | Error } = useQueries(queries);
  if (isLoading || !isAuthenticated || me instanceof Error || !me?.synced || me.role !== "company")
    return null;
  return (
    <Link
      href="/team"
      className="inline-flex min-h-11 items-center rounded-md text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      Workspace members
    </Link>
  );
}
