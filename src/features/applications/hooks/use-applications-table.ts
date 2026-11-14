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

export type ApplicationTab = NonNullable<SearchArgs["tab"]>;

/** Matches the server's per-tab default, so the sorted header is the one actually applied. */
const DEFAULT_SORT_BY_TAB: Record<ApplicationTab, ApplicationSort> = {
  applications: { key: "submitted", direction: "descending" },
  offers: { key: "expires", direction: "ascending" },
  accepted: { key: "expires", direction: "ascending" },
};

/**
 * The applications table's tab, search, filters, sort and page, and the query
 * arguments they make. Switching tabs starts the new tab from its own defaults,
 * since a sort or filter chosen on one tab may not exist on the other. Any change to what is listed returns to page 1, since
 * the page the user was on may no longer exist. Typing is debounced so each
 * keystroke doesn't run a query.
 */
export function useApplicationsTable() {
  const [tab, setTabValue] = useState<ApplicationTab>("applications");
  const [search, setSearchValue] = useState("");
  const [starred, setStarredValue] = useState(false);
  const [hideRejected, setHideRejectedValue] = useState(false);
  const [sort, setSortValue] = useState<ApplicationSort>(DEFAULT_SORT_BY_TAB.applications);
  const [page, setPage] = useState(1);
  const appliedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();

  const args = useMemo<SearchArgs>(
    () => ({
      tab,
      search: appliedSearch || undefined,
      starred: starred || undefined,
      // Declined offers are part of the Offers tab, so there is nothing to hide there.
      hideRejected: (tab === "applications" && hideRejected) || undefined,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    [tab, appliedSearch, starred, hideRejected, sort, page],
  );

  return {
    args,
    tab,
    defaultSort: DEFAULT_SORT_BY_TAB[tab],
    search,
    starred,
    hideRejected,
    sort,
    page,
    /** Whether the results are narrowed by anything the user can clear. */
    hasFilters: appliedSearch !== "" || starred || (tab === "applications" && hideRejected),
    /** Whether anything is typed or toggled, including a search still being debounced. */
    canClear: search !== "" || starred || (tab === "applications" && hideRejected),
    setPage,
    setTab(next: ApplicationTab) {
      if (next === tab) return;
      setTabValue(next);
      setSearchValue("");
      setStarredValue(false);
      setHideRejectedValue(false);
      setSortValue(DEFAULT_SORT_BY_TAB[next]);
      setPage(1);
    },
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
