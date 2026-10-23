import { EmptyState } from "@/components/empty-state";

/** What the feed shows when no opportunity matches. */
export function NoOpportunities({
  starredOnly,
  filtered,
}: {
  starredOnly: boolean;
  filtered: boolean;
}) {
  const message = starredOnly
    ? "You haven't starred any open opportunities yet. Tap the star on one to save it here."
    : filtered
      ? "No opportunities match these filters. Try another niche or type."
      : "There are no open opportunities right now. Check back soon.";
  return <EmptyState>{message}</EmptyState>;
}
