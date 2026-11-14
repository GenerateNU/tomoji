"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { usePaginatedQuery } from "convex/react";
import { useState } from "react";
import { CompanyAvatar } from "@/components/ui/avatar";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { disputeTitle, formatDisputeDate } from "../lib/dispute-labels";
import { DisputeStatusTag } from "./dispute-status-tag";
import { NoDisputes } from "./no-disputes";

const PAGE_SIZE = 10;

/**
 * One tab of the caller's disputes, a page at a time. Choosing a row's title
 * opens it; the whole row is clickable for pointer users.
 *
 * Pages are cut client-side from `usePaginatedQuery`'s results. A live Convex
 * page keeps the range it first loaded, so it grows as disputes are filed;
 * fetching each page with a fixed cursor showed 12 rows on a page of 10.
 */
export function DisputesTable({
  status,
  onOpen,
}: {
  status: "open" | "resolved";
  onOpen: (disputeId: Id<"disputes">) => void;
}) {
  const {
    results,
    status: loadStatus,
    loadMore,
  } = usePaginatedQuery(api.disputes.list, { status }, { initialNumItems: PAGE_SIZE });
  const [pageIndex, setPageIndex] = useState(0);

  const loading = loadStatus === "LoadingFirstPage";
  const start = pageIndex * PAGE_SIZE;
  const rows = results.slice(start, start + PAGE_SIZE);
  const lastPageIndex = Math.max(0, Math.ceil(results.length / PAGE_SIZE) - 1);
  // Disputes can leave this tab (one resolves) or a load can come back empty,
  // leaving the current page past the end. Step back to the last real page.
  const fetching = loadStatus === "LoadingFirstPage" || loadStatus === "LoadingMore";
  if (!fetching && pageIndex > lastPageIndex) setPageIndex(lastPageIndex);

  if (!loading && results.length === 0) return <NoDisputes status={status} />;

  const label = status === "open" ? "Active disputes" : "Past disputes";
  const pageLoading = loading || (loadStatus === "LoadingMore" && rows.length < PAGE_SIZE);
  const hasNext = results.length > start + PAGE_SIZE || loadStatus === "CanLoadMore";

  function goNext() {
    if (!hasNext) return;
    // Fetch the next chunk only when the following page isn't loaded yet.
    if (results.length < start + 2 * PAGE_SIZE && loadStatus === "CanLoadMore") loadMore(PAGE_SIZE);
    setPageIndex(pageIndex + 1);
  }

  return (
    <div className="flex flex-col gap-4">
      <Table bare aria-label={label} className="min-w-[44rem]">
        <TableHeader>
          <TableHead className="w-[45%]">Title</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Date Created</TableHead>
          <TableHead>Status</TableHead>
        </TableHeader>
        <TableBody aria-busy={pageLoading} className="transition-opacity">
          {loading || rows.length === 0
            ? Array.from({ length: 3 }, (_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 4 }, (_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-5 w-3/4" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : rows.map((dispute) => (
                <TableRow
                  key={dispute._id}
                  onClick={() => onOpen(dispute._id)}
                  className="cursor-pointer hover:bg-gray-25"
                >
                  <TableCell>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpen(dispute._id);
                      }}
                      className={cn(
                        "w-full cursor-pointer truncate rounded-xs text-left",
                        focusRing,
                      )}
                    >
                      {disputeTitle(dispute)}
                    </button>
                  </TableCell>
                  <TableCell avatar={<CompanyAvatar size={32} />}>{dispute.companyName}</TableCell>
                  <TableCell>{formatDisputeDate(dispute._creationTime)}</TableCell>
                  <TableCell type="custom">
                    <DisputeStatusTag dispute={dispute} />
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
      {pageLoading && (
        <span className="sr-only" role="status">
          Loading disputes…
        </span>
      )}

      <Pagination aria-label={`${label} pages`} className="justify-center">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              render={<button type="button" />}
              disabled={pageIndex === 0}
              onClick={() => setPageIndex(Math.max(0, pageIndex - 1))}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink render={<span />} isActive>
              {pageIndex + 1}
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              render={<button type="button" />}
              disabled={!hasNext}
              onClick={goNext}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}
