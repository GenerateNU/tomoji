import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

/** What the feed shows when no opportunity matches, with a way back to everything. */
export function NoOpportunities({
  starredOnly,
  filtered,
  onClear,
}: {
  starredOnly: boolean;
  filtered: boolean;
  onClear: () => void;
}) {
  if (filtered) {
    return (
      <EmptyState className="flex flex-col items-center gap-4">
        <p>No opportunities match your search and filters.</p>
        <Button variant="secondary-subtle" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      </EmptyState>
    );
  }
  return (
    <EmptyState>
      {starredOnly
        ? "You haven't starred any open opportunities yet. Tap the star on one to save it here."
        : "There are no open opportunities right now. Check back soon."}
    </EmptyState>
  );
}
