import type { PaginationStatus } from "convex/react";
import type { ReactNode } from "react";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** The page size each modal table asks for. */
export const PAGE_SIZE = 25;

/** A centered message in a tab's gray body: empty lists, unavailable features. */
export function TabMessage({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      {title ? <p className="text-body-lg font-medium text-gray-950">{title}</p> : null}
      <p className="max-w-sm text-body text-gray-500">{children}</p>
    </div>
  );
}

/** Placeholder rows shaped like a table card while its first page loads. */
export function TableSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-4 rounded-lg bg-gray-0 p-4 shadow-card md:p-6">
      <span className="sr-only" role="status">
        {label}
      </span>
      {[0, 1, 2].map((row) => (
        <div key={row} aria-hidden className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/** "Load more" under a paginated table, while the backend has more rows. */
export function LoadMore({
  status,
  onLoadMore,
}: {
  status: PaginationStatus;
  onLoadMore: () => void;
}) {
  if (status === "Exhausted" || status === "LoadingFirstPage") return null;
  const loading = status === "LoadingMore";
  return (
    <Button variant="secondary-subtle" size="sm" onClick={onLoadMore} disabled={loading}>
      {loading ? <Spinner size={16} label="Loading more" className="text-current" /> : null}
      Load more
    </Button>
  );
}
