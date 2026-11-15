"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/spinner";

/** How long the hand-off screen shows before the creator lands on the app. */
const HAND_OFF_MS = 2_600;

/**
 * The last screen. Onboarding is already saved by the time this renders, so
 * the wait is only so the hand-off doesn't flash past; the redirect runs even
 * if the animation is skipped for reduced motion.
 */
export function ReadyStep() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace("/"), HAND_OFF_MS);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <div className="flex min-w-0 flex-1 items-center justify-center bg-gray-0 px-6 py-10 sm:px-10">
        <div className="flex w-full max-w-md flex-col gap-4">
          <h1 className="text-heading-lg font-medium text-gray-950">
            Hang tight while we get your account ready…
          </h1>
          <p className="text-body font-normal text-gray-500">
            You&rsquo;re already one step closer to connecting with companies and getting your first
            post out there!
          </p>
          <p role="status" className="sr-only">
            Setting up your account.
          </p>
        </div>
      </div>
      <div className="hidden min-w-0 flex-1 items-center justify-center bg-gray-50 p-10 lg:flex">
        {/* Placeholder for the product snapshots: the brand mark turning, which
            already falls back to a pulse under prefers-reduced-motion. */}
        <Spinner
          size={48}
          label="Setting up your account"
          className="scale-200 text-blue-primary"
        />
      </div>
    </div>
  );
}
