"use client";

import type { Id } from "@convex/_generated/dataModel";
import { useId } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatRelativeTime } from "../lib/format";
import type { ApplicationSort, ApplicationTab } from "../hooks/use-applications-table";
import { ApplicationStatusBadge } from "./application-status-badge";
import {
  ApplicationCompanyAvatar,
  ApplicationCompensation,
  ApplicationStar,
  OfferTitleButton,
  displayCompanyName,
  type ApplicationRowData,
} from "./application-row";
import { OfferExpiry } from "./offer-expiry";

// Narrow screens have no column headers to click, so sorting is one list of choices.
type SortOption = { value: string; label: string; sort: ApplicationSort };

const APPLICATION_SORT_OPTIONS: SortOption[] = [
  {
    value: "submitted:descending",
    label: "Newest submitted",
    sort: { key: "submitted", direction: "descending" },
  },
  {
    value: "submitted:ascending",
    label: "Oldest submitted",
    sort: { key: "submitted", direction: "ascending" },
  },
  {
    value: "name:ascending",
    label: "Name A–Z",
    sort: { key: "name", direction: "ascending" },
  },
  {
    value: "name:descending",
    label: "Name Z–A",
    sort: { key: "name", direction: "descending" },
  },
  {
    value: "company:ascending",
    label: "Company A–Z",
    sort: { key: "company", direction: "ascending" },
  },
  {
    value: "company:descending",
    label: "Company Z–A",
    sort: { key: "company", direction: "descending" },
  },
  {
    value: "status:ascending",
    label: "Status",
    sort: { key: "status", direction: "ascending" },
  },
  {
    value: "compensation:descending",
    label: "Highest pay",
    sort: { key: "compensation", direction: "descending" },
  },
  {
    value: "compensation:ascending",
    label: "Lowest pay",
    sort: { key: "compensation", direction: "ascending" },
  },
];

const OFFER_SORT_OPTIONS: SortOption[] = [
  {
    value: "expires:ascending",
    label: "Expiring soonest",
    sort: { key: "expires", direction: "ascending" },
  },
  {
    value: "expires:descending",
    label: "Expiring latest",
    sort: { key: "expires", direction: "descending" },
  },
  ...APPLICATION_SORT_OPTIONS.filter((option) => option.sort.key !== "status"),
];

const ACCEPTED_SORT_OPTIONS: SortOption[] = [
  {
    value: "accepted:descending",
    label: "Recently accepted",
    sort: { key: "accepted", direction: "descending" },
  },
  {
    value: "accepted:ascending",
    label: "Oldest accepted",
    sort: { key: "accepted", direction: "ascending" },
  },
  ...APPLICATION_SORT_OPTIONS.filter(
    (option) => option.sort.key !== "status" && option.sort.key !== "submitted",
  ),
];

const SORT_OPTIONS_BY_TAB: Record<ApplicationTab, SortOption[]> = {
  applications: APPLICATION_SORT_OPTIONS,
  offers: OFFER_SORT_OPTIONS,
  accepted: ACCEPTED_SORT_OPTIONS,
};

/** The sort choice for screens too narrow for clickable column headers. */
export function ApplicationSortSelect({
  tab = "applications",
  sort,
  onSortChange,
}: {
  tab?: ApplicationTab;
  sort: ApplicationSort;
  onSortChange: (sort: ApplicationSort) => void;
}) {
  const labelId = useId();
  const options = SORT_OPTIONS_BY_TAB[tab];
  const value = `${sort.key}:${sort.direction}`;
  return (
    <div className="flex flex-col gap-2">
      <Label id={labelId}>Sort by</Label>
      <Select
        items={options}
        // A header click on a wider screen can pick a sort this list lacks.
        value={options.some((option) => option.value === value) ? value : null}
        onValueChange={(next) => {
          const option = options.find((candidate) => candidate.value === next);
          if (option) onSortChange(option.sort);
        }}
      >
        <SelectTrigger aria-labelledby={labelId} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/**
 * Applications as stacked cards, for screens narrower than the table needs. On
 * the Offers and Accepted tabs a card opens the offer, from its title or from a click on the card.
 */
export function ApplicationCardList({
  rows,
  now,
  tab = "applications",
  onOpen,
  className,
}: {
  rows: readonly ApplicationRowData[];
  now: number;
  tab?: ApplicationTab;
  onOpen?: (applicationId: Id<"applications">) => void;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-col divide-y divide-gray-100", className)}>
      {rows.map((row) => (
        <li
          key={row.applicationId}
          className={cn(
            "flex flex-col gap-2 py-4 first:pt-0 last:pb-0",
            onOpen && "cursor-pointer",
          )}
          onClick={
            onOpen
              ? (event) => {
                  // Buttons and links in the card do their own thing.
                  if ((event.target as HTMLElement).closest("button, a")) return;
                  onOpen(row.applicationId);
                }
              : undefined
          }
        >
          <div className="flex items-start justify-between gap-2">
            {onOpen ? (
              <OfferTitleButton
                row={row}
                onOpen={onOpen}
                className="flex min-h-11 items-center text-body break-words text-gray-950"
              />
            ) : (
              <span className="min-w-0 pt-2.5 text-body font-medium break-words text-gray-950">
                {row.title}
              </span>
            )}
            <ApplicationStar row={row} />
          </div>
          <div className="flex min-w-0 items-center gap-2 text-body-sm text-gray-700">
            <ApplicationCompanyAvatar row={row} />
            <span className="min-w-0 truncate">{displayCompanyName(row)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {tab === "accepted" ? (
              row.offerAcceptedAt !== undefined && (
                <span className="text-body-sm text-gray-500">
                  Accepted {formatRelativeTime(row.offerAcceptedAt, now)}
                </span>
              )
            ) : (
              <>
                {tab === "offers" ? (
                  <OfferExpiry
                    status={row.status}
                    offerExpiresAt={row.offerExpiresAt}
                    now={now}
                    className="text-body-sm"
                  />
                ) : (
                  <ApplicationStatusBadge status={row.status} />
                )}
                <span className="text-body-sm text-gray-500">
                  Submitted {formatRelativeTime(row.submittedAt, now)}
                </span>
              </>
            )}
          </div>
          <div className="text-body-sm text-gray-950">
            <ApplicationCompensation row={row} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Placeholder cards while the first page loads. */
export function SkeletonCardList({ className }: { className?: string }) {
  return (
    <ul aria-hidden className={cn("flex flex-col divide-y divide-gray-100", className)}>
      {Array.from({ length: 5 }, (_, index) => (
        <li key={index} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-6 w-2/3" />
        </li>
      ))}
    </ul>
  );
}
