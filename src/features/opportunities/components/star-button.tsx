"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { RiStarFill, RiStarLine } from "@remixicon/react";
import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

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
        className={cn(
          "flex shrink-0 cursor-pointer rounded-xs text-gray-950 disabled:opacity-50",
          focusRing,
        )}
      >
        {isStarred ? <RiStarFill size={16} aria-hidden /> : <RiStarLine size={16} aria-hidden />}
      </button>
      {error !== null && (
        <span role="alert" className="text-body-xs text-red-600">
          {error}
        </span>
      )}
    </span>
  );
}
