"use client";

import { useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useCallback, useMemo } from "react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

function useAuthFromWorkOS() {
  const { user, loading: userLoading } = useAuth();
  const { getAccessToken, refresh } = useAccessToken();
  const userId = user?.id ?? null;

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        const token = forceRefreshToken ? await refresh() : await getAccessToken();
        return token ?? null;
      } catch {
        return null;
      }
    },
    [getAccessToken, refresh],
  );

  return useMemo(
    () => ({
      isLoading: userLoading,
      isAuthenticated: userId !== null,
      fetchAccessToken,
    }),
    [userLoading, userId, fetchAccessToken],
  );
}

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuthFromWorkOS}>
      {children}
    </ConvexProviderWithAuth>
  );
}
