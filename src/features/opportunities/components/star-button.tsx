"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";

/**
 * Toggles the creator's star. The feed updates on its own once the mutation
 * lands, because Convex queries are live; `pending` only blocks double taps.
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
  const star = useMutation(api.opportunities.star);
  const unstar = useMutation(api.opportunities.unstar);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setPending(true);
    setError(null);
    try {
      await (isStarred ? unstar : star)({ opportunityId });
    } catch (caught) {
      setError(errorMessage(caught, { not_found: "This opportunity is no longer open." }));
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={isStarred}
        aria-label={isStarred ? `Unstar ${title}` : `Star ${title}`}
        className="rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
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
