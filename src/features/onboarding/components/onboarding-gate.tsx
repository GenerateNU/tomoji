"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useMe } from "@/features/users/hooks/use-me";

/**
 * Sends a creator who has not finished onboarding into it, from anywhere in
 * the app. Renders nothing; it sits in the authenticated layout so every page
 * is covered without each one remembering to check.
 *
 * It deliberately does not block what is already on screen. The redirect lands
 * within a tick, and holding every page behind a profile read would make the
 * whole app wait on a query most people do not need.
 */
export function OnboardingGate() {
  const router = useRouter();
  const pathname = usePathname();
  const me = useMe();
  const isCreator = me !== undefined && me !== null && me.synced && me.role === "creator";
  const profile = useQuery(api.creators.me, isCreator ? {} : "skip");

  const unfinished = profile !== undefined && profile.onboardingCompletedAt === undefined;
  useEffect(() => {
    if (!unfinished) return;
    // Onboarding lives outside this layout, so this cannot loop.
    if (pathname.startsWith("/onboarding")) return;
    // X sends the creator back here rather than into the flow, so a finished
    // link resumes on the next step instead of the one they just completed.
    // Read from the URL directly: `useSearchParams` would force every page
    // under this layout behind a Suspense boundary just for a redirect.
    const linked = new URLSearchParams(window.location.search).get("x_link") === "connected";
    router.replace(linked ? "/onboarding/basic-info" : "/onboarding/connect-x");
  }, [unfinished, pathname, router]);

  return null;
}
