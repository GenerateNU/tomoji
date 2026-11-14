"use client";

import type { Id } from "@convex/_generated/dataModel";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useSetStarred } from "../hooks/use-star-mutations";

/**
 * Toggles the creator's star. It flips immediately through an optimistic
 * update shared with every view of this opportunity; the mutation runs in the
 * background and Convex rolls the star back if it fails.
 */
export function StarButton({
  opportunityId,
  title,
  isStarred,
}: {
  opportunityId: Id<"opportunities">;
  title: string;
  isStarred: boolean;
}) {
  const setStarred = useSetStarred();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    setStarred(opportunityId, !isStarred).catch((caught: unknown) => {
      setError(
        errorMessage(caught, {
          not_found: "This opportunity is no longer open.",
        }),
      );
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={isStarred}
        aria-label={isStarred ? `Unstar ${title}` : `Star ${title}`}
        className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- fixed-size design icon */}
        <img
          src={
            isStarred ? "/icons/opportunities/star-fill.svg" : "/icons/opportunities/star-line.svg"
          }
          alt=""
          width={18}
          height={18}
        />
      </button>
      {error !== null && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
