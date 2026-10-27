"use client";

import { api } from "@convex/_generated/api";
import { useState } from "react";
import { useStableQuery } from "@/hooks/use-stable-query";
import { type ApplicationStatus } from "../lib/application-status";
import { FIRST_PAGE, nextPage, previousPage } from "../lib/cursor-pages";
import { ApplicationRow } from "./application-row";
import { ApplicationStatusFilter } from "./application-status-filter";
import { ApplicationsPagination, type PageSize } from "./applications-pagination";
import { NoApplications } from "./no-applications";
import { SkeletonRow } from "./skeleton-row";

// Fixed widths from the Figma (column + 20px gap) so columns don't shift as
// filters change which rows are shown. Status is wider than the design's 112px
// to fit labels like "Opportunity full"; Compensation takes the rest.
const COLUMNS = [
  { label: "Name", width: "w-[320px]" },
  { label: "Status", width: "w-[180px]" },
  { label: "Submitted", width: "w-[165px]" },
  { label: "Expiration date", width: "w-[175px]" },
  { label: "Compensation", width: "" },
];

/** The calling creator's applications, filterable by status, one page at a time. */
export function CreatorApplications() {
  const [status, setStatus] = useState<ApplicationStatus | null>(null);
  const [pageSize, setPageSize] = useState<PageSize>(5);
  const [pages, setPages] = useState(FIRST_PAGE);
  // Relative dates are computed against the time the page opened.
  const [now] = useState(() => Date.now());

  // Keeps the current rows on screen while a new filter or page loads.
  const { data: result, isStale } = useStableQuery(api.applications.listMine, {
    status: status ?? undefined,
    paginationOpts: { numItems: pageSize, cursor: pages.cursors[pages.index] },
  });

  // Cursors belong to the filters that produced them, so start over when those change.
  function changeStatus(next: ApplicationStatus | null) {
    setStatus(next);
    setPages(FIRST_PAGE);
  }
  function changePageSize(next: PageSize) {
    setPageSize(next);
    setPages(FIRST_PAGE);
  }

  // Convex has no total count; it's only known when everything fits on page one.
  const count =
    result !== undefined && pages.index === 0 && result.isDone ? result.page.length : null;

  return (
    <div className="flex flex-col gap-10">
      <h1 className="text-3xl font-semibold">Applications</h1>

      <ApplicationStatusFilter value={status} onChange={changeStatus} />

      <section aria-labelledby="applications-heading" className="flex flex-col gap-5">
        <h2 id="applications-heading" className="text-lg font-medium">
          Applications{count !== null && <span className="font-normal"> ({count})</span>}
        </h2>

        {result !== undefined && result.page.length === 0 ? (
          <NoApplications
            status={status}
            onShowAll={() => changeStatus(null)}
            onBack={pages.index > 0 ? () => setPages(previousPage) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[66rem] table-fixed border-separate border-spacing-0 text-left">
              <colgroup>
                {COLUMNS.map((column) => (
                  <col key={column.label} className={column.width} />
                ))}
              </colgroup>
              <thead>
                <tr className="text-base font-medium text-muted-foreground">
                  {COLUMNS.map((column) => (
                    <th
                      key={column.label}
                      scope="col"
                      className="pr-5 pb-2.5 font-medium last:pr-0"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody
                aria-busy={result === undefined || isStale}
                className={isStale ? "opacity-60 transition-opacity" : "transition-opacity"}
              >
                {result === undefined
                  ? Array.from({ length: 3 }, (_, i) => <SkeletonRow key={i} />)
                  : result.page.map((application) => (
                      <ApplicationRow key={application._id} application={application} now={now} />
                    ))}
              </tbody>
            </table>
            {result === undefined && (
              <span className="sr-only" role="status">
                Loading applications…
              </span>
            )}
          </div>
        )}
      </section>

      <ApplicationsPagination
        page={pages.index + 1}
        hasPrevious={pages.index > 0}
        // A stale page's cursor belongs to the old filter, so wait for the new one.
        hasNext={result !== undefined && !isStale && !result.isDone}
        onPrevious={() => setPages(previousPage)}
        onNext={() => {
          if (result !== undefined && !isStale)
            setPages((current) => nextPage(current, result.continueCursor));
        }}
        pageSize={pageSize}
        onPageSizeChange={changePageSize}
      />
    </div>
  );
}
