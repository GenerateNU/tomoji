"use client";

import { RiEyeOffLine, RiSearchLine, RiStarLine } from "@remixicon/react";
import { FilterChip } from "@/components/filter-chip";
import { TextField } from "@/components/text-field";
import type { ApplicationsTable } from "../hooks/use-applications-table";

const SEARCH_LABELS = {
  applications: "Search applications",
  offers: "Search offers",
  accepted: "Search accepted offers",
} as const;

/**
 * Keyword search plus the Starred and Hide rejected toggles. The search field has no
 * visible label, only an accessible one. Hide rejected is on the Applications tab only.
 */
export function ApplicationFilters({ table }: { table: ApplicationsTable }) {
  const isApplications = table.tab === "applications";
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center">
      <TextField
        aria-label={SEARCH_LABELS[table.tab]}
        icon={RiSearchLine}
        placeholder="Search by keyword"
        type="search"
        name="search"
        autoComplete="off"
        maxLength={100}
        value={table.search}
        onChange={(event) => table.setSearch(event.target.value)}
        className="w-full md:w-80"
      />
      <div className="flex flex-wrap gap-2">
        <FilterChip
          icon={RiStarLine}
          selected={table.starred}
          onPressedChange={table.setStarred}
          className="min-h-11 md:min-h-0"
        >
          Starred
        </FilterChip>
        {isApplications && (
          <FilterChip
            icon={RiEyeOffLine}
            selected={table.hideRejected}
            onPressedChange={table.setHideRejected}
            className="min-h-11 md:min-h-0"
          >
            Hide rejected
          </FilterChip>
        )}
      </div>
    </div>
  );
}
