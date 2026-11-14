"use client";

import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import {
  RiCloseLine,
  RiMoreLine,
  RiPauseCircleLine,
  RiPencilLine,
  RiPlayCircleLine,
  RiRestartLine,
  RiStopCircleLine,
} from "@remixicon/react";
import { useMutation } from "convex/react";
import { useState, type ComponentProps } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { errorMessage, errorReason } from "@/lib/errors";
import { iconProps, type IconComponent } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";

type Lifecycle = "pause" | "resume" | "close" | "remove" | "publish";

const LIFECYCLE: Record<
  Lifecycle,
  {
    label: string;
    icon: IconComponent;
    destructive?: boolean;
    title: string;
    description: string;
    confirmVariant: ComponentProps<typeof Button>["variant"];
    done: string;
  }
> = {
  publish: {
    label: "Publish Opportunity",
    icon: RiPlayCircleLine,
    title: "Publish this opportunity?",
    description: "It goes live, and creators who match its eligibility can find and apply to it.",
    confirmVariant: "primary",
    done: "is live",
  },
  pause: {
    label: "Pause Opportunity",
    icon: RiPauseCircleLine,
    title: "Are you sure you want to pause this opportunity?",
    description:
      "Creators won’t be able to find or apply to it until you resume it. Creators already taking part keep going.",
    confirmVariant: "secondary",
    done: "is paused",
  },
  resume: {
    label: "Resume Opportunity",
    icon: RiRestartLine,
    title: "Are you sure you want to resume this opportunity?",
    description: "Creators will be able to find and apply to it again.",
    confirmVariant: "primary",
    done: "is live again",
  },
  close: {
    label: "End Opportunity",
    icon: RiStopCircleLine,
    destructive: true,
    title: "Are you sure you want to end this opportunity?",
    description:
      "It closes for good: no one new can apply, and waiting applicants are told it ended. Creators already taking part keep their work and pay.",
    confirmVariant: "destructive-subtle",
    done: "has ended",
  },
  remove: {
    label: "Cancel Opportunity",
    icon: RiCloseLine,
    destructive: true,
    title: "Are you sure you want to cancel this opportunity?",
    description: "The draft and its deliverables are deleted. This can’t be undone.",
    confirmVariant: "destructive-subtle",
    done: "was deleted",
  },
};

/** What a company can do with an opportunity in each state, as the backend allows it. */
export function availableActions(
  opportunity: Pick<Doc<"opportunities">, "status" | "deadline" | "numFilledSlots">,
  now: number,
): { canEdit: boolean; lifecycle: Lifecycle[] } {
  // Past its deadline a published brief is closing; the backend refuses edits.
  const expired = opportunity.status !== "draft" && opportunity.deadline <= now;
  switch (opportunity.status) {
    case "draft":
      return {
        canEdit: true,
        // Only an untouched draft can be deleted.
        lifecycle: opportunity.numFilledSlots === 0 ? ["publish", "remove"] : ["publish"],
      };
    case "open":
      return { canEdit: !expired, lifecycle: expired ? ["close"] : ["pause", "close"] };
    case "paused":
      return { canEdit: !expired, lifecycle: expired ? ["close"] : ["resume", "close"] };
    default:
      return { canEdit: false, lifecycle: [] };
  }
}

const REASONS: Record<string, string> = {
  campaign_not_open: "Its campaign isn’t live, so it can’t go live yet.",
  campaign_closed: "Its campaign has ended.",
  invalid_deadline: "Its deadline has passed. Edit the deadline first.",
  opportunity_expired: "Its deadline has passed.",
  deadline_after_campaign_end: "Its deadline is after the campaign ends. Edit the deadline first.",
  deliverables_required: "It needs at least one deliverable before it can go live.",
  ai_review_criteria_required: "Every deliverable needs review criteria while AI review is on.",
  opportunity_not_removable: "Only an unused draft can be deleted.",
  opportunity_has_workflow_history:
    "Creators have already engaged with it, so it can’t be deleted.",
};

/**
 * The "…" menu on an opportunity: edit, plus the lifecycle changes its status
 * allows, each confirmed first. Renders nothing for an ended opportunity.
 */
export function OpportunityActions({
  opportunity,
  now,
  onEdit,
}: {
  opportunity: Pick<
    Doc<"opportunities">,
    "_id" | "title" | "status" | "deadline" | "numFilledSlots"
  >;
  now: number;
  onEdit: (opportunityId: Id<"opportunities">) => void;
}) {
  const mutations = {
    pause: useMutation(api.opportunities.pause),
    resume: useMutation(api.opportunities.resume),
    close: useMutation(api.opportunities.close),
    remove: useMutation(api.opportunities.remove),
    publish: useMutation(api.opportunities.publish),
  };
  const [confirming, setConfirming] = useState<Lifecycle | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { canEdit, lifecycle } = availableActions(opportunity, now);
  if (!canEdit && lifecycle.length === 0) return null;

  async function run(action: Lifecycle) {
    setPending(true);
    setError(null);
    try {
      await mutations[action]({ opportunityId: opportunity._id });
      setConfirming(null);
      toast.success(`${opportunity.title} ${LIFECYCLE[action].done}.`);
    } catch (caught) {
      const reason = errorReason(caught);
      setError(
        (reason && REASONS[reason]) ??
          errorMessage(caught, { not_found: "This opportunity no longer exists." }),
      );
    } finally {
      setPending(false);
    }
  }

  const current = confirming === null ? null : LIFECYCLE[confirming];
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Actions for ${opportunity.title}`}
          className={cn(
            "flex size-8 cursor-pointer items-center justify-center rounded-sm text-gray-700 hover:bg-gray-50 data-popup-open:bg-gray-50",
            focusRing,
          )}
        >
          <RiMoreLine {...iconProps} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canEdit && (
            <DropdownMenuItem icon={RiPencilLine} onClick={() => onEdit(opportunity._id)}>
              Edit Opportunity
            </DropdownMenuItem>
          )}
          {lifecycle
            .filter((action) => !LIFECYCLE[action].destructive)
            .map((action) => (
              <DropdownMenuItem
                key={action}
                icon={LIFECYCLE[action].icon}
                onClick={() => {
                  setError(null);
                  setConfirming(action);
                }}
              >
                {LIFECYCLE[action].label}
              </DropdownMenuItem>
            ))}
          {lifecycle.some((action) => LIFECYCLE[action].destructive) &&
            (canEdit || lifecycle.some((action) => !LIFECYCLE[action].destructive)) && (
              <DropdownMenuSeparator />
            )}
          {lifecycle
            .filter((action) => LIFECYCLE[action].destructive)
            .map((action) => (
              <DropdownMenuItem
                key={action}
                variant="destructive"
                icon={LIFECYCLE[action].icon}
                onClick={() => {
                  setError(null);
                  setConfirming(action);
                }}
              >
                {LIFECYCLE[action].label}
              </DropdownMenuItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {current && confirming && (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open) setConfirming(null);
          }}
          title={current.title}
          description={current.description}
          confirmVariant={current.confirmVariant}
          pending={pending}
          error={error}
          onConfirm={() => run(confirming)}
        />
      )}
    </>
  );
}
