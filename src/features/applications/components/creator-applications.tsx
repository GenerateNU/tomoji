"use client";

import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { EmptyState } from "@/components/empty-state";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button, buttonVariants } from "@/components/ui/button";
import { TableBody, TableCard, TableHead, TableHeader } from "@/components/ui/table";
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useNow } from "@/hooks/use-now";
import { useStableQuery } from "@/hooks/use-stable-query";
import { cn } from "@/lib/utils";
import {
  useApplicationsTable,
  type ApplicationSortKey,
  type ApplicationTab,
  type ApplicationsTable,
} from "../hooks/use-applications-table";
import {
  ApplicationCardList,
  ApplicationSortSelect,
  SkeletonCardList,
} from "./application-card-list";
import { ApplicationFilters } from "./application-filters";
import { OfferModal } from "./offer-modal";
import { ApplicationRow } from "./application-row";
import { ApplicationsPagination } from "./applications-pagination";
import { SkeletonRow } from "./skeleton-row";

type TabCount = { count: number; isCapped: boolean };

/** "31", or "300+" when the count stopped at the read limit. */
function formatTabCount({ count, isCapped }: TabCount): string {
  return isCapped ? `${count}+` : String(count);
}

function ApplicationTabs({
  tab,
  onTabChange,
  counts,
  children,
}: {
  tab: ApplicationTab;
  onTabChange: (tab: ApplicationTab) => void;
  counts: FunctionReturnType<typeof api.applications.searchMine>["counts"] | undefined;
  children: ReactNode;
}) {
  return (
    <Tabs
      value={tab}
      onValueChange={(next) => {
        if (next === "applications" || next === "offers" || next === "accepted") onTabChange(next);
      }}
      className="gap-6 md:gap-8"
    >
      {/* Scrolls sideways on narrow screens instead of wrapping the tabs. */}
      <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        <TabsList className="w-max min-w-full">
          <TabsTrigger value="applications">
            Applications
            {counts && <TabsCount>{formatTabCount(counts.applications)}</TabsCount>}
          </TabsTrigger>
          <TabsTrigger value="offers">
            Offers
            {counts && <TabsCount>{formatTabCount(counts.offers)}</TabsCount>}
          </TabsTrigger>
          <TabsTrigger value="accepted">
            Accepted
            {counts && <TabsCount>{formatTabCount(counts.accepted)}</TabsCount>}
          </TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value={tab} className="flex flex-col gap-6 md:gap-8">
        {children}
      </TabsContent>
    </Tabs>
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

type TableColumn = { label: string; sortKey: ApplicationSortKey; className?: string };

type TabConfig = {
  noun: string;
  tableTitle: string;
  /** The Offers and Accepted tabs are named by their tab, so the table has no heading of its own. */
  hideTitle: boolean;
  /** Whether a row opens the offer. */
  opensModal: boolean;
  columns: TableColumn[];
};

const NAME_COLUMN = { label: "Name", sortKey: "name" } as const;
const COMPANY_COLUMN = { label: "Company", sortKey: "company" } as const;
const COMPENSATION_COLUMN = { label: "Compensation", sortKey: "compensation" } as const;
const SUBMITTED_COLUMN = { label: "Submitted", sortKey: "submitted", className: "w-28" } as const;

const TAB_CONFIG: Record<ApplicationTab, TabConfig> = {
  applications: {
    noun: "applications",
    tableTitle: "Applications",
    hideTitle: false,
    opensModal: false,
    columns: [
      { ...NAME_COLUMN, className: "w-[32%]" },
      { ...COMPANY_COLUMN, className: "w-[20%]" },
      { label: "Status", sortKey: "status", className: "w-32" },
      SUBMITTED_COLUMN,
      COMPENSATION_COLUMN,
    ],
  },
  // The Offers tab's third column is when the offer ends, not where it stands.
  offers: {
    noun: "offers",
    tableTitle: "Offers",
    hideTitle: true,
    opensModal: true,
    columns: [
      { ...NAME_COLUMN, className: "w-[30%]" },
      { ...COMPANY_COLUMN, className: "w-[20%]" },
      { label: "Expiration date", sortKey: "expires", className: "w-36" },
      SUBMITTED_COLUMN,
      COMPENSATION_COLUMN,
    ],
  },
  accepted: {
    noun: "accepted offers",
    tableTitle: "Accepted offers",
    hideTitle: true,
    opensModal: true,
    columns: [
      { ...NAME_COLUMN, className: "w-[40%]" },
      { ...COMPANY_COLUMN, className: "w-[22%]" },
      { label: "Accepted", sortKey: "accepted", className: "w-36" },
      COMPENSATION_COLUMN,
    ],
  },
};

function NeverHadState({
  tab,
  onSwitchTab,
}: {
  tab: ApplicationTab;
  onSwitchTab: (tab: ApplicationTab) => void;
}) {
  if (tab === "offers") {
    return (
      <EmptyState className="flex flex-col items-center gap-3">
        <p className="font-medium text-gray-950">No offers yet.</p>
        <p>When a company sends you an offer, it appears here. Offers usually last 48 hours.</p>
        <Button variant="secondary-subtle" onClick={() => onSwitchTab("applications")}>
          View applications
        </Button>
      </EmptyState>
    );
  }
  if (tab === "accepted") {
    return (
      <EmptyState className="flex flex-col items-center gap-3">
        <p className="font-medium text-gray-950">No accepted offers yet.</p>
        <p>Offers you accept appear here.</p>
        <Button variant="secondary-subtle" onClick={() => onSwitchTab("offers")}>
          View offers
        </Button>
      </EmptyState>
    );
  }
  return (
    <EmptyState className="flex flex-col items-center gap-3">
      <p className="font-medium text-gray-950">You haven&apos;t applied to anything yet.</p>
      <p>When you apply to an opportunity, you can follow its status here.</p>
      <Link href="/opportunities" className={buttonVariants({ variant: "secondary-subtle" })}>
        Browse opportunities
      </Link>
    </EmptyState>
  );
}

function ApplicationsContent({ table }: { table: ApplicationsTable }) {
  const isWide = useMediaQuery("(min-width: 768px)");
  const now = useNow();
  const resultsRef = useRef<HTMLElement>(null);
  const [openApplicationId, setOpenApplicationId] = useState<Id<"applications"> | null>(null);
  // Kept apart from the id so the modal's content doesn't change as it closes.
  const [modalOpen, setModalOpen] = useState(false);
  // Keeps the current rows on screen while a new filter or page loads.
  const { data: latest, isStale } = useStableQuery(api.applications.searchMine, table.args);
  // Rows of the other tab have different columns, so they are never shown under this tab's headers.
  const data = latest?.tab === table.tab ? latest : undefined;
  const { noun, tableTitle, hideTitle, opensModal, columns } = TAB_CONFIG[table.tab];

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

  const openOffer = opensModal
    ? (applicationId: Id<"applications">) => {
        setOpenApplicationId(applicationId);
        setModalOpen(true);
      }
    : undefined;

  // Back to the title that opened the offer, or to the results when the row has
  // left the tab, e.g. after the offer was accepted.
  const returnFocus = useCallback(() => {
    const title =
      openApplicationId === null
        ? null
        : document.querySelector<HTMLElement>(`[data-offer-title="${openApplicationId}"]`);
    return title ?? resultsRef.current;
  }, [openApplicationId]);

  const headProps = (key: ApplicationSortKey) => ({
    sort: table.sort.key === key ? table.sort.direction : ("unsorted" as const),
    onSort: () => table.toggleSort(key),
  });

  const neverHad = data !== undefined && data.counts[table.tab].count === 0 && !table.hasFilters;

  let results;
  if (data === undefined) {
    results = (
      <>
        <span className="sr-only" role="status">
          Loading {noun}…
        </span>
        {isWide ? (
          <TableCard
            title={tableTitle}
            hideTitle={hideTitle}
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
                <SkeletonRow key={index} showSubmitted={table.tab !== "accepted"} />
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
  } else if (neverHad) {
    results = <NeverHadState tab={table.tab} onSwitchTab={table.setTab} />;
  } else if (data.totalCount === 0) {
    results = (
      <EmptyState className="flex flex-col items-center gap-3">
        <p className="font-medium text-gray-950">No {noun} match your filters.</p>
        <Button variant="secondary-subtle" onClick={table.clearFilters}>
          Clear filters
        </Button>
      </EmptyState>
    );
  } else if (isWide) {
    results = (
      <TableCard
        title={tableTitle}
        hideTitle={hideTitle}
        count={data.totalCount}
        className="[&_table]:min-w-176"
      >
        <TableHeader>
          {columns.map((column) => (
            <TableHead
              key={column.sortKey}
              className={column.className}
              {...headProps(column.sortKey)}
            >
              {column.label}
            </TableHead>
          ))}
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <ApplicationRow
              key={row.applicationId}
              row={row}
              now={now}
              tab={table.tab}
              onOpen={openOffer}
            />
          ))}
        </TableBody>
      </TableCard>
    );
  } else {
    results = (
      <div className="flex flex-col gap-4 rounded-lg bg-gray-0 p-4 shadow-card">
        {!hideTitle && (
          <h2 className="flex items-center gap-1.5 text-body-lg font-medium text-gray-950">
            Applications <span className="text-gray-500">({data.totalCount})</span>
          </h2>
        )}
        <ApplicationSortSelect tab={table.tab} sort={table.sort} onSortChange={table.setSort} />
        <ApplicationCardList rows={data.rows} now={now} tab={table.tab} onOpen={openOffer} />
      </div>
    );
  }

  const tabCount = data?.counts[table.tab];
  // Only dims rows that are the same tab's; the other tab's are replaced by a skeleton.
  const isDimmed = isStale && data !== undefined;

  return (
    <>
      <ApplicationTabs tab={table.tab} onTabChange={table.setTab} counts={data?.counts}>
        <ApplicationFilters table={table} />
        <section
          ref={resultsRef}
          aria-label={tableTitle}
          aria-busy={data === undefined || isStale}
          tabIndex={-1}
          className={cn(
            "flex flex-col gap-3 outline-none transition-opacity",
            isDimmed && "opacity-60",
          )}
        >
          {results}
          {tabCount?.isCapped && (
            <p className="text-body-sm text-gray-500">
              Showing your {tabCount.count} most recent {noun}.
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
      </ApplicationTabs>
      <OfferModal
        applicationId={openApplicationId}
        open={modalOpen}
        onOpenChange={setModalOpen}
        finalFocus={returnFocus}
      />
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
