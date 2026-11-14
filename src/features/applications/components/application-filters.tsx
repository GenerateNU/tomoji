"use client";

import { RiEyeOffLine, RiSearchLine, RiStarLine } from "@remixicon/react";
import { FilterChip } from "@/components/filter-chip";
import { TextField } from "@/components/text-field";
import { cn } from "@/lib/utils";
import type { ApplicationsTable } from "../hooks/use-applications-table";

/**
 * Keyword search plus the Starred and Hide rejected toggles. The Offers tab has
 * no visible label, only an accessible one, and no Hide rejected: declined
 * offers are part of that tab.
 */
export function ApplicationFilters({ table }: { table: ApplicationsTable }) {
  const isOffers = table.tab === "offers";
  return (
    <div
      className={cn(
        "flex flex-col gap-3 md:flex-row",
        isOffers ? "md:items-center" : "md:items-end",
      )}
    >
      <TextField
        label={isOffers ? undefined : "Search"}
        aria-label={isOffers ? "Search offers" : undefined}
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
      <div className={cn("flex flex-wrap gap-2", !isOffers && "md:pb-1")}>
        <FilterChip
          icon={RiStarLine}
          selected={table.starred}
          onPressedChange={table.setStarred}
          className="min-h-11 md:min-h-0"
        >
          Starred
        </FilterChip>
        {!isOffers && (
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
