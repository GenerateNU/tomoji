"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMe } from "@/features/users/hooks/use-me";

/**
 * How the creator appears on their own posts: "Linda A." and their linked X
 * handle, which is absent until they link X or while it loads.
 */
export function useCreatorIdentity(): { name: string; handle?: string } {
  const me = useMe();
  const account = useQuery(api.xAccounts.me);
  if (!me?.synced) return { name: "", handle: account?.username };
  const initial = me.lastName.trim().charAt(0);
  return {
    name: initial ? `${me.firstName} ${initial.toUpperCase()}.` : me.firstName,
    handle: account?.username,
  };
}
