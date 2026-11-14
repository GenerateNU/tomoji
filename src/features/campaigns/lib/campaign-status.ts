import type { Doc } from "@convex/_generated/dataModel";
import { formatRelativeTime } from "@/lib/relative-time";

export type CampaignTab = Doc<"campaigns">["status"];

/** The list's tabs, in order, with the statuses they show. */
export const CAMPAIGN_TABS: { value: CampaignTab; label: string }[] = [
  { value: "open", label: "Live" },
  { value: "draft", label: "Drafts" },
  { value: "paused", label: "Paused" },
  { value: "closed", label: "Ended" },
];

/** "Began 4 weeks ago", "Starts in 3 days", "Ended 2 days ago": the card's second line. */
export function campaignTiming(
  campaign: Pick<Doc<"campaigns">, "status" | "startsAt" | "endsAt">,
  now: number,
): string {
  if (campaign.status === "closed") {
    return `Ended ${formatRelativeTime(campaign.endsAt ?? now, now)}`;
  }
  if (campaign.startsAt > now) return `Starts ${formatRelativeTime(campaign.startsAt, now)}`;
  const began = `Began ${formatRelativeTime(campaign.startsAt, now)}`;
  return campaign.status === "draft" ? `Draft · ${began.toLowerCase()}` : began;
}
