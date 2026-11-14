import type { FeedOpportunity } from "../lib/types";
import { formatSpotsLeft } from "../lib/format";

/** "Application required" for gated opportunities, otherwise the open spots. */
export function AvailabilityPill({ opportunity }: { opportunity: FeedOpportunity }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
      {opportunity.isGated ? "Application required" : formatSpotsLeft(opportunity)}
    </span>
  );
}
