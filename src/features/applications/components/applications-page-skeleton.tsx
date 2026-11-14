import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCard, TableHead, TableHeader } from "@/components/ui/table";
import type { ApplicationTab } from "../hooks/use-applications-table";
import { SkeletonCardList } from "./application-card-list";
import { SkeletonRow } from "./skeleton-row";
import { TAB_CONFIG } from "./tab-config";

/**
 * The results while they load: the table header and rows from md up, cards
 * below. Both are rendered and one hidden with CSS, so the server and the
 * client agree on the markup whatever the viewport.
 */
export function ApplicationsResultsSkeleton({ tab }: { tab: ApplicationTab }) {
  const { tableTitle, hideTitle, columns } = TAB_CONFIG[tab];
  return (
    <>
      <div className="hidden md:block">
        <TableCard
          title={tableTitle}
          hideTitle={hideTitle}
          bare
          className="[&_table]:min-w-176"
          aria-hidden
        >
          <TableHeader>
            {columns.map((column) => (
              <TableHead key={column.sortKey} className={column.className}>
                {column.label}
              </TableHead>
            ))}
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }, (_, index) => (
              <SkeletonRow key={index} showSubmitted={tab !== "accepted"} />
            ))}
          </TableBody>
        </TableCard>
      </div>
      <div className="md:hidden">
        <SkeletonCardList />
      </div>
    </>
  );
}

/** The whole applications page while the account loads, laid out like the real one. */
export function ApplicationsPageSkeleton() {
  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <span className="sr-only" role="status">
        Loading applications…
      </span>
      <div aria-hidden className="flex flex-col gap-6 md:gap-8">
        <Skeleton className="h-8 w-56 md:h-10" />
        <div className="flex flex-col gap-6 md:gap-8">
          <div className="relative flex w-full gap-6 pb-3.75 after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gray-100">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-24" />
          </div>
          <div className="flex flex-col gap-6 md:gap-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-center">
              <Skeleton className="h-11 w-full md:w-80" />
              <Skeleton className="h-8 w-24" />
            </div>
            <ApplicationsResultsSkeleton tab="applications" />
          </div>
        </div>
      </div>
    </div>
  );
}
