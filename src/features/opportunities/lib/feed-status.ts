import { formatSpotsLeft } from "./format";
import type { FeedOpportunity } from "./types";

export type FeedTag = { label: string; tone: "primary" | "neutral" };

/** What the card's button does next, from the creator's point of view. */
export type FeedAction =
  | { kind: "apply"; label: "Apply" }
  | { kind: "claim"; label: "Claim spot" }
  | { kind: "view-application"; label: "View application" }
  | { kind: "view"; label: "View opportunity" };

/** A cancelled assignment no longer holds a spot, so it reads like none. */
function holdsSpot(opportunity: FeedOpportunity): boolean {
  return opportunity.assignment !== null && opportunity.assignment.status !== "cancelled";
}

function spotsLeft(opportunity: FeedOpportunity): number {
  return Math.max(opportunity.maxSlots - opportunity.numFilledSlots, 0);
}

/**
 * The tags on a card: how creators get in (an application or an open spot),
 * then the creator's own progress.
 */
export function feedTags(opportunity: FeedOpportunity): FeedTag[] {
  const tags: FeedTag[] = [
    {
      label: opportunity.isGated ? "Application required" : formatSpotsLeft(opportunity),
      tone: "primary",
    },
  ];
  if (holdsSpot(opportunity)) tags.push({ label: "Claimed spot", tone: "neutral" });
  else if (opportunity.application !== null) tags.push({ label: "Applied", tone: "neutral" });
  return tags;
}

/** The card's main action: the next step if there is one, otherwise viewing it. */
export function feedAction(opportunity: FeedOpportunity): FeedAction {
  if (holdsSpot(opportunity)) return { kind: "view", label: "View opportunity" };
  if (opportunity.application !== null) {
    return { kind: "view-application", label: "View application" };
  }
  if (opportunity.isGated) return { kind: "apply", label: "Apply" };
  if (spotsLeft(opportunity) === 0) return { kind: "view", label: "View opportunity" };
  return { kind: "claim", label: "Claim spot" };
}
