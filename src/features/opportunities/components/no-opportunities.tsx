import Image from "next/image";
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
      <div className="flex flex-col items-center gap-5 py-10 text-center">
        <Image src="/illustrations/globe.png" alt="" width={190} height={190} />
        <div className="flex flex-col gap-2">
          <p className="text-body-lg font-medium text-gray-700">No opportunities match</p>
          <p className="text-body text-gray-500">Try a different keyword or clear some filters.</p>
        </div>
        <Button size="sm" onClick={onClear}>
          Clear search and filters
        </Button>
      </div>
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
