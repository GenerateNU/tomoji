import type { PaginationOptions } from "convex/server";

/** Rows a filtered feed may scan for one page when the caller doesn't set a limit. */
export const DEFAULT_MAXIMUM_ROWS_READ = 500;

/**
 * Feeds that filter while paginating keep reading until the page is full, and
 * filtered-out rows still count as reads. Capping the scan makes a page return
 * early, with a cursor to continue, instead of reading the whole table.
 */
export function withRowsReadCap(paginationOpts: PaginationOptions): PaginationOptions {
  return {
    ...paginationOpts,
    maximumRowsRead: paginationOpts.maximumRowsRead ?? DEFAULT_MAXIMUM_ROWS_READ,
  };
}
