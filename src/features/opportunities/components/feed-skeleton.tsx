import { Skeleton } from "@/components/ui/skeleton";
export function FeedSkeleton() {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
      aria-busy="true"
      aria-label="Loading opportunities"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-[322px] rounded-2xl" />
      ))}
    </div>
  );
}
