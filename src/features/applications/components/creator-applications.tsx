"use client";

import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button, buttonVariants } from "@/components/ui/button";
import { TableBody, TableCard, TableHead, TableHeader } from "@/components/ui/table";
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useStableQuery } from "@/hooks/use-stable-query";
import { cn } from "@/lib/utils";
import {
  useApplicationsTable,
  type ApplicationSortKey,
  type ApplicationsTable,
} from "../hooks/use-applications-table";
import {
  ApplicationCardList,
  ApplicationSortSelect,
  SkeletonCardList,
} from "./application-card-list";
import { ApplicationFilters } from "./application-filters";
import { ApplicationRow } from "./application-row";
import { ApplicationsPagination } from "./applications-pagination";
import { SkeletonRow } from "./skeleton-row";

type TabCount = { count: number; isCapped: boolean };

/** "31", or "300+" when the count stopped at the read limit. */
function formatTabCount({ count, isCapped }: TabCount): string {
  return isCapped ? `${count}+` : String(count);
}

function ApplicationTabs({
  counts,
}: {
  counts: FunctionReturnType<typeof api.applications.searchMine>["counts"] | undefined;
}) {
  return (
    // Scrolls sideways on narrow screens instead of wrapping the tabs.
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <Tabs value="applications">
        <TabsList className="w-max min-w-full">
          <TabsTrigger value="applications">
            Applications
            {counts && <TabsCount>{formatTabCount(counts.applications)}</TabsCount>}
          </TabsTrigger>
          {/* Offers and accepted offers arrive later; their counts are real already. */}
          <TabsTrigger value="offers" disabled>
            Offers
            {counts && <TabsCount>{formatTabCount(counts.offers)}</TabsCount>}
            <span className="sr-only">(coming soon)</span>
          </TabsTrigger>
          <TabsTrigger value="accepted" disabled>
            Accepted
            {counts && <TabsCount>{formatTabCount(counts.accepted)}</TabsCount>}
            <span className="sr-only">(coming soon)</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );
}

function ApplicationsError({ onRetry, onClear }: { onRetry: () => void; onClear: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3">
      <p className="text-body text-gray-700">We couldn&apos;t load your applications.</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onRetry}>Try again</Button>
        <Button variant="secondary-subtle" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    </div>
  );
}

function ApplicationsContent({ table }: { table: ApplicationsTable }) {
  const isWide = useMediaQuery("(min-width: 768px)");
  // Relative dates are computed against the time the page opened.
  const [now] = useState(() => Date.now());
  const resultsRef = useRef<HTMLElement>(null);
  // Keeps the current rows on screen while a new filter or page loads.
  const { data, isStale } = useStableQuery(api.applications.searchMine, table.args);

  // The server clamps a page past the end, e.g. after rows were removed.
  const { page, setPage } = table;
  useEffect(() => {
    if (data !== undefined && !isStale && data.page !== page) setPage(data.page);
  }, [data, isStale, page, setPage]);

  function goToPage(next: number) {
    table.setPage(next);
    // Moves keyboard and screen-reader users to the new rows instead of the pager.
    resultsRef.current?.focus();
  }

  const headProps = (key: ApplicationSortKey) => ({
    sort: table.sort.key === key ? table.sort.direction : ("unsorted" as const),
    onSort: () => table.toggleSort(key),
  });

  const neverApplied =
    data !== undefined && data.counts.applications.count === 0 && !table.hasFilters;

  let results;
  if (data === undefined) {
    results = (
      <>
        <span className="sr-only" role="status">
          Loading applications…
        </span>
        {isWide ? (
          <TableCard title="Applications" className="[&_table]:min-w-176" aria-hidden>
            <TableHeader>
              <TableHead className="w-[32%]">Name</TableHead>
              <TableHead className="w-[20%]">Company</TableHead>
              <TableHead className="w-32">Status</TableHead>
              <TableHead className="w-28">Submitted</TableHead>
              <TableHead>Compensation</TableHead>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }, (_, index) => (
                <SkeletonRow key={index} />
              ))}
            </TableBody>
          </TableCard>
        ) : (
          <div className="rounded-lg bg-gray-0 p-4 shadow-card">
            <SkeletonCardList />
          </div>
        )}
      </>
    );
  } else if (neverApplied) {
    results = (
      <EmptyState className="flex flex-col items-center gap-3">
        <p className="font-medium text-gray-950">You haven&apos;t applied to anything yet.</p>
        <p>When you apply to an opportunity, you can follow its status here.</p>
        <Link href="/opportunities" className={buttonVariants({ variant: "secondary-subtle" })}>
          Browse opportunities
        </Link>
      </EmptyState>
    );
  } else if (data.totalCount === 0) {
    results = (
      <EmptyState className="flex flex-col items-center gap-3">
        <p className="font-medium text-gray-950">No applications match your filters.</p>
        <Button variant="secondary-subtle" onClick={table.clearFilters}>
          Clear filters
        </Button>
      </EmptyState>
    );
  } else if (isWide) {
    results = (
      <TableCard title="Applications" count={data.totalCount} className="[&_table]:min-w-176">
        <TableHeader>
          <TableHead className="w-[32%]" {...headProps("name")}>
            Name
          </TableHead>
          <TableHead className="w-[20%]" {...headProps("company")}>
            Company
          </TableHead>
          <TableHead className="w-32" {...headProps("status")}>
            Status
          </TableHead>
          <TableHead className="w-28" {...headProps("submitted")}>
            Submitted
          </TableHead>
          <TableHead {...headProps("compensation")}>Compensation</TableHead>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <ApplicationRow key={row.applicationId} row={row} now={now} />
          ))}
        </TableBody>
      </TableCard>
    );
  } else {
    results = (
      <div className="flex flex-col gap-4 rounded-lg bg-gray-0 p-4 shadow-card">
        <h2 className="flex items-center gap-1.5 text-body-lg font-medium text-gray-950">
          Applications <span className="text-gray-500">({data.totalCount})</span>
        </h2>
        <ApplicationSortSelect sort={table.sort} onSortChange={table.setSort} />
        <ApplicationCardList rows={data.rows} now={now} />
      </div>
    );
  }

  return (
    <>
      <ApplicationTabs counts={data?.counts} />
      <ApplicationFilters table={table} />
      <section
        ref={resultsRef}
        aria-label="Applications"
        aria-busy={data === undefined || isStale}
        tabIndex={-1}
        className={cn(
          "flex flex-col gap-3 outline-none transition-opacity",
          isStale && "opacity-60",
        )}
      >
        {results}
        {data?.counts.applications.isCapped && (
          <p className="text-body-sm text-gray-500">
            Showing your {data.counts.applications.count} most recent applications.
          </p>
        )}
      </section>
      {data !== undefined && data.pageCount > 1 && (
        <ApplicationsPagination
          page={data.page}
          pageCount={data.pageCount}
          onPageChange={goToPage}
        />
      )}
    </>
  );
}

/** The calling creator's applications: tabs with counts, search, filters, sortable rows, and pages. */
export function CreatorApplications() {
  const table = useApplicationsTable();
  // Remounting the boundary is what clears a failed read.
  const [attempt, setAttempt] = useState(0);

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <h1 className="text-heading-sm font-medium text-gray-950 md:text-heading-md">Applications</h1>
      <ErrorBoundary
        key={attempt}
        fallback={() => (
          <ApplicationsError
            onRetry={() => setAttempt((value) => value + 1)}
            onClear={() => {
              table.clearFilters();
              setAttempt((value) => value + 1);
            }}
          />
        )}
      >
        <ApplicationsContent table={table} />
      </ErrorBoundary>
    </div>
  );
}
