"use client";

import type { Id } from "@convex/_generated/dataModel";
import { RiStarFill, RiStarLine } from "@remixicon/react";
import { toast } from "sonner";
import { useSetStarred } from "@/features/opportunities/hooks/use-star-mutations";
import { errorMessage } from "@/lib/errors";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Stars or unstars the opportunity behind an application. Starring is refused
 * once creators can no longer see the opportunity, though unstarring always
 * works, so an unstarred row of a closed opportunity shows a disabled star.
 * The star flips immediately through an optimistic update; Convex rolls it
 * back if the mutation fails.
 */
export function StarToggle({
  opportunityId,
  title,
  isStarred,
  canStar,
}: {
  opportunityId: Id<"opportunities">;
  title: string;
  isStarred: boolean;
  canStar: boolean;
}) {
  const setStarred = useSetStarred();
  const unavailable = !canStar && !isStarred;

  function toggle() {
    setStarred(opportunityId, !isStarred).catch((error: unknown) => {
      toast.error(
        errorMessage(error, {
          not_found: "This opportunity is no longer open, so it can't be starred.",
        }),
      );
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={unavailable}
      aria-pressed={isStarred}
      aria-label={
        unavailable
          ? `${title} is no longer open, so it can't be starred`
          : isStarred
            ? `Unstar ${title}`
            : `Star ${title}`
      }
      title={unavailable ? "No longer open, so it can't be starred" : undefined}
      className={cn(
        // A 44px hit area on touch screens around the 16px icon.
        "flex shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 max-md:size-11 md:size-6",
        isStarred ? "text-blue-primary" : "text-gray-400 not-disabled:hover:text-gray-700",
        focusRing,
      )}
    >
      {isStarred ? <RiStarFill {...iconProps} /> : <RiStarLine {...iconProps} />}
    </button>
  );
}
