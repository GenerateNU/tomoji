"use client";

import { PaginationArrow, PaginationControl } from "@/components/ui/pagination";

/**
 * Numbered pages from sm up. Below that, nine 44px touch targets won't fit a
 * 320px screen, so it shrinks to previous, "Page 2 of 5", and next.
 */
export function ApplicationsPagination({
  page,
  pageCount,
  onPageChange,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
}) {
  return (
    <>
      <nav aria-label="Pagination" className="flex items-center justify-between sm:hidden">
        <PaginationArrow
          direction="previous"
          render={<button type="button" />}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        />
        <span aria-live="polite" className="text-body-sm text-gray-700">
          Page {page} of {pageCount}
        </span>
        <PaginationArrow
          direction="next"
          render={<button type="button" />}
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        />
      </nav>
      <div className="hidden justify-center sm:flex">
        <PaginationControl page={page} pageCount={pageCount} onPageChange={onPageChange} />
      </div>
    </>
  );
}
