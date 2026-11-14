import type { Doc } from "@convex/_generated/dataModel";
import { formatRelativeTime } from "@/lib/relative-time";

export type OpportunityTab = Doc<"opportunities">["status"];

/** The campaign page's tabs, in order, with the statuses they show. */
export const OPPORTUNITY_TABS: { value: OpportunityTab; label: string }[] = [
  { value: "open", label: "Live" },
  { value: "draft", label: "Drafts" },
  { value: "paused", label: "Paused" },
  { value: "closed", label: "Ended" },
];

/** "Began 4 weeks ago", "Paused · began 3 days ago", "Ended 2 days ago": a card's second line. */
export function opportunityTiming(
  opportunity: Pick<Doc<"opportunities">, "status" | "_creationTime" | "deadline">,
  now: number,
): string {
  const created = formatRelativeTime(opportunity._creationTime, now);
  switch (opportunity.status) {
    case "draft":
      return `Draft · created ${created}`;
    case "paused":
      return `Paused · began ${created}`;
    case "closed":
      // A manual close has no recorded time; only a passed deadline dates it.
      return opportunity.deadline <= now
        ? `Ended ${formatRelativeTime(opportunity.deadline, now)}`
        : "Ended early";
    default:
      return `Began ${created}`;
  }
}
