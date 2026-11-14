"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useState } from "react";
import { RiStarFill, RiStarLine } from "@remixicon/react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/errors";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

/**
 * Stars or unstars the opportunity behind an application. Starring is refused
 * once creators can no longer see the opportunity, though unstarring always
 * works, so an unstarred row of a closed opportunity shows a disabled star.
 * The row updates by itself when the mutation lands; `pending` only blocks
 * double taps.
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
  const star = useMutation(api.opportunities.star);
  const unstar = useMutation(api.opportunities.unstar);
  const [pending, setPending] = useState(false);
  const unavailable = !canStar && !isStarred;

  async function toggle() {
    setPending(true);
    try {
      await (isStarred ? unstar : star)({ opportunityId });
    } catch (error) {
      toast.error(
        errorMessage(error, {
          not_found: "This opportunity is no longer open, so it can't be starred.",
        }),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending || unavailable}
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
