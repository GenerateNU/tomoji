"use client";

import { useRef, useState, type ReactNode } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { RecommendedOpportunities } from "@/features/opportunities/components/recommended-opportunities";
import { ProfileCompletionCard } from "@/features/profile/components/profile-completion-card";
import { errorMessage } from "@/lib/errors";

/**
 * Keeps one Home card's failed read inside that card, with a retry, instead of
 * sending the whole page to the route's error screen.
 */
function HomeCard({ name, children }: { name: string; children: ReactNode }) {
  // Remounting the boundary is what clears a failed read.
  const [attempt, setAttempt] = useState(0);
  return (
    <ErrorBoundary
      key={attempt}
      fallback={(error) => (
        <section
          aria-label={name}
          className="flex flex-col items-start gap-4 rounded-lg bg-gray-0 p-6 shadow-card"
        >
          <p role="alert" className="text-body text-gray-700">
            {errorMessage(error, { not_found: `${name} isn't available right now.` })}
          </p>
          <Button variant="secondary-subtle" onClick={() => setAttempt((value) => value + 1)}>
            Retry
          </Button>
        </section>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}

/**
 * The creator landing page: a nudge to finish the profile until it is
 * complete, then the opportunities that match them best. Page padding
 * matches the Opportunities feed.
 */
export function CreatorHome() {
  // Focusable from script only (tabIndex -1), so it's a landing spot without a tab stop.
  const heading = useRef<HTMLHeadingElement>(null);
  return (
    <div className="flex w-full flex-col gap-10 px-4 py-12 sm:px-10 lg:px-16 lg:py-16">
      <h1 ref={heading} tabIndex={-1} className="text-heading-lg text-gray-950">
        Home
      </h1>
      <div className="flex flex-col gap-4">
        <HomeCard name="Profile completion">
          <ProfileCompletionCard focusWhenDone={heading} />
        </HomeCard>
        <HomeCard name="Opportunities for you">
          <RecommendedOpportunities />
        </HomeCard>
      </div>
    </div>
  );
}
