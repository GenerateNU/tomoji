"use client";

import { api } from "@convex/_generated/api";
import type { FunctionArgs } from "convex/server";
import { useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

export const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

type SearchArgs = FunctionArgs<typeof api.applications.searchMine>;
export type ApplicationSort = NonNullable<SearchArgs["sort"]>;
export type ApplicationSortKey = ApplicationSort["key"];

const DEFAULT_SORT: ApplicationSort = { key: "submitted", direction: "descending" };

/**
 * The applications table's search, filters, sort and page, and the query
 * arguments they make. Any change to what is listed returns to page 1, since
 * the page the user was on may no longer exist. Typing is debounced so each
 * keystroke doesn't run a query.
 */
export function useApplicationsTable() {
  const [search, setSearchValue] = useState("");
  const [starred, setStarredValue] = useState(false);
  const [hideRejected, setHideRejectedValue] = useState(false);
  const [sort, setSortValue] = useState<ApplicationSort>(DEFAULT_SORT);
  const [page, setPage] = useState(1);
  const appliedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();

  const args = useMemo<SearchArgs>(
    () => ({
      tab: "applications",
      search: appliedSearch || undefined,
      starred: starred || undefined,
      hideRejected: hideRejected || undefined,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    [appliedSearch, starred, hideRejected, sort, page],
  );

  return {
    args,
    search,
    starred,
    hideRejected,
    sort,
    page,
    /** Whether the results are narrowed by anything the user can clear. */
    hasFilters: appliedSearch !== "" || starred || hideRejected,
    /** Whether anything is typed or toggled, including a search still being debounced. */
    canClear: search !== "" || starred || hideRejected,
    setPage,
    setSearch(next: string) {
      setSearchValue(next);
      setPage(1);
    },
    setStarred(next: boolean) {
      setStarredValue(next);
      setPage(1);
    },
    setHideRejected(next: boolean) {
      setHideRejectedValue(next);
      setPage(1);
    },
    setSort(next: ApplicationSort) {
      setSortValue(next);
      setPage(1);
    },
    /** The first click on a column sorts ascending; later clicks flip it. */
    toggleSort(key: ApplicationSortKey) {
      setSortValue((current) => ({
        key,
        direction:
          current.key === key && current.direction === "ascending" ? "descending" : "ascending",
      }));
      setPage(1);
    },
    clearFilters() {
      setSearchValue("");
      setStarredValue(false);
      setHideRejectedValue(false);
      setPage(1);
    },
  };
}

export type ApplicationsTable = ReturnType<typeof useApplicationsTable>;
