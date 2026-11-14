"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useConvexAuth, useQueries, type RequestForQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@convex/_generated/api";

export function ProfileNavLink() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  // useQueries needs a stable configuration to preserve its subscription between renders.
  const queries = useMemo(
    (): RequestForQueries =>
      !isLoading && isAuthenticated ? { me: { query: api.users.me, args: {} } } : {},
    [isLoading, isAuthenticated],
  );
  // This runs in the layout, outside the page error boundary. Keep other navigation usable on error.
  const { me }: { me?: FunctionReturnType<typeof api.users.me> | Error } = useQueries(queries);
  if (isLoading || !isAuthenticated || me instanceof Error || !me?.synced || me.role !== "creator")
    return null;

  return (
    <Link
      href="/profile"
      className="rounded py-2 text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      Profile
    </Link>
  );
}
