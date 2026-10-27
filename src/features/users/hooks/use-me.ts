"use client";

import { api } from "@convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";

export type Me = FunctionReturnType<typeof api.users.me>;

/**
 * The signed-in account, or `null` when nobody is signed in and `undefined`
 * while that is still being decided.
 *
 * `users.me` needs an identity, so it cannot run until Convex holds a token.
 * Skipping the query leaves its result `undefined` forever for a signed-out
 * visitor, which reads as "still loading" unless the caller knows to check
 * authentication separately. Returning `null` makes that case impossible to
 * miss. Convex shares one subscription per query and arguments, so calling
 * this from several components costs nothing extra.
 */
export function useMe(): Me | null | undefined {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useQuery(api.users.me, !isLoading && isAuthenticated ? {} : "skip");
  if (isLoading) return undefined;
  if (!isAuthenticated) return null;
  return me;
}
