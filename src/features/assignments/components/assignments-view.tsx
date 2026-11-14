"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { RiExpandUpDownLine, RiGlobalLine, RiSearchLine } from "@remixicon/react";
import { usePaginatedQuery, useQuery } from "convex-helpers/react/cache/hooks";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PaginationControl } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequireAccount } from "@/features/users/components/require-account";
import { cn } from "@/lib/utils";
import { assignmentStatusLabel } from "./assignment-status";
import { AssignmentCompany } from "./assignment-company";

const PAGE_SIZE = 12;
const queues = [
  { value: "notStarted", label: "Not started" },
  { value: "review", label: "In review" },
  { value: "changesNeeded", label: "Changes needed" },
  { value: "approved", label: "Approved" },
] as const;
type Queue = (typeof queues)[number]["value"];

/** Resolves the selected tab from the workspace URL. */
export function assignmentQueue(status?: string): Queue {
  return queues.find(({ value }) => value === status)?.value ?? "notStarted";
}
type Stage = "detail" | "draft" | "post";

/** Lists creator assignments by the current submission and posting state. */
export function AssignmentsView({ stage = "detail", status }: { stage?: Stage; status?: string }) {
  return (
    <section className="flex w-full flex-col gap-8 px-4 pt-8 pb-12 sm:px-8 lg:px-16 lg:pt-16">
      <RequireAccount
        role="creator"
        next="/assignments"
        wrongRole="Assignments are available to creators."
      >
        <h1 className="text-[28px] leading-tight font-medium">Assignments</h1>
        <AssignmentTabs key={status} stage={stage} initialQueue={assignmentQueue(status)} />
      </RequireAccount>
    </section>
  );
}

/** Loads status counts and opportunity choices for the workspace. */
function AssignmentTabs({ stage, initialQueue }: { stage: Stage; initialQueue: Queue }) {
  const options = useQuery(api.assignments.listMineFilterOptions);
  return (
    <Tabs defaultValue={initialQueue} className="gap-10">
      <TabsList
        aria-label="Assignment status"
        className="max-w-full gap-5 overflow-x-auto md:gap-7"
      >
        {queues.map(({ value, label }) => (
          <TabsTrigger key={value} value={value}>
            {label}
            {options?.counts && <TabsCount>{options.counts[value]}</TabsCount>}
          </TabsTrigger>
        ))}
      </TabsList>
      {queues.map(({ value }) => (
        <TabsContent key={value} value={value}>
          <AssignmentList
            queue={value}
            stage={stage}
            opportunities={options?.opportunities ?? []}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

type Filters = {
  search: string;
  opportunityId?: Id<"opportunities">;
};

/** Keeps filters in the toolbar and resets the cursor when criteria change. */
function AssignmentList({
  queue,
  stage,
  opportunities,
}: {
  queue: Queue;
  stage: Stage;
  opportunities: { id: Id<"opportunities">; label: string }[];
}) {
  const [filters, setFilters] = useState<Filters>({ search: "" });
  const [search, setSearch] = useState("");
  const id = useId();
  useEffect(() => {
    const timer = setTimeout(
      () => setFilters((value) => ({ ...value, search: search.trim() })),
      250,
    );
    return () => clearTimeout(timer);
  }, [search]);
  return (
    <div className="space-y-10">
      <div className="grid max-w-[576px] gap-3 sm:grid-cols-[1.28fr_1fr]">
        <div className="grid gap-2">
          <label htmlFor={id} className="text-body-sm text-gray-500">
            Search
          </label>
          <div className="relative">
            <RiSearchLine
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              id={id}
              type="search"
              placeholder="Search by keyword"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        <AssignmentSelect
          label="Opportunity"
          options={[{ id: "", label: "Select opportunities" }, ...opportunities]}
          value={filters.opportunityId ?? ""}
          onChange={(opportunityId) =>
            setFilters({
              ...filters,
              opportunityId: (opportunityId || undefined) as Filters["opportunityId"],
            })
          }
        />
      </div>
      <AssignmentRows key={JSON.stringify(filters)} filters={filters} queue={queue} stage={stage} />
    </div>
  );
}

/** Uses the shared select treatment for the opportunity filter. */
function AssignmentSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const items = options.map(({ id, label }) => ({ value: id, label }));
  return (
    <div className="grid min-w-0 gap-2">
      <span id={id} className="text-body-sm text-gray-500">
        {label}
      </span>
      <Select items={items} value={value} onValueChange={(next) => onChange(next ?? "")}>
        <SelectTrigger className="w-full" aria-labelledby={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const columns =
  "grid gap-x-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(8rem,1.2fr)_8rem]";
const date = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

/** Paginates over matching rows and opens the next step when that stage is available. */
function AssignmentRows({
  filters,
  queue,
  stage,
}: {
  filters: Filters;
  queue: Queue;
  stage: Stage;
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{
    field: "title" | "companyName" | "opportunityTitle" | "date";
    direction: "asc" | "desc";
  }>({ field: "date", direction: "desc" });
  const sortColumns = [
    { field: "title", label: "Name" },
    { field: "companyName", label: "Company" },
    { field: "opportunityTitle", label: "Opportunity" },
    { field: "date", label: "Assigned" },
  ] as const;
  const { results, status, loadMore } = usePaginatedQuery(
    api.assignments.listMineSummaries,
    {
      ...filters,
      order: sort.field === "date" ? sort.direction : "desc",
      phase: "current",
      queue,
    },
    { initialNumItems: PAGE_SIZE, customPagination: true },
  );
  const loadedPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, loadedPages);
  const visible = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  if (sort.field !== "date") {
    const { field, direction } = sort;
    visible.sort(
      (a, b) => (a[field] ?? "").localeCompare(b[field] ?? "") * (direction === "asc" ? 1 : -1),
    );
  }
  const hasMore = status === "CanLoadMore" || status === "LoadingMore";

  if (status === "LoadingFirstPage")
    return <Skeleton aria-label="Loading assignments" className="h-32 w-full" />;
  if (visible.length === 0 && !hasMore) {
    return (
      <div role="status" className="grid justify-items-center gap-2 px-4 py-20 text-center">
        <RiGlobalLine aria-hidden className="mb-7 size-24 text-blue-primary/35" />
        <p className="text-body-lg text-gray-700">Nothing to see here!</p>
        <p className="text-body-sm text-gray-500">
          {filters.search || filters.opportunityId
            ? "Try a different filter to see results."
            : "There are no assignments in this tab."}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className={cn(columns, "hidden py-2 text-body-sm text-gray-500 lg:grid")}>
        {sortColumns.map(({ field, label }) => (
          <button
            key={field}
            type="button"
            className="flex w-fit items-center gap-1 rounded-xs hover:text-gray-950"
            aria-label={
              field === "date"
                ? "Sort by assignment date"
                : `Sort this page by ${label.toLowerCase()}`
            }
            onClick={() => {
              if (field === "date") setPage(1);
              setSort({
                field,
                direction: sort.field === field && sort.direction === "asc" ? "desc" : "asc",
              });
            }}
          >
            {label} <RiExpandUpDownLine className="size-3.5" aria-hidden />
          </button>
        ))}
      </div>
      <ul>
        {visible.map((row) => {
          const href = `/assignments/${row._id}?status=${queue}`;
          const status = row.next?.status;
          const action =
            row.status === "active"
              ? status === "changesRequested"
                ? "Resubmit"
                : status === "approved"
                  ? "Add post link"
                  : status === "unsubmitted"
                    ? "Submit"
                    : "View"
              : "View";
          const task =
            action === "Add post link" && stage === "post"
              ? "post"
              : (action === "Resubmit" || action === "Submit") && stage !== "detail"
                ? "draft"
                : null;
          return (
            <li
              key={row._id}
              className={cn(columns, "grid-cols-[minmax(0,1fr)_auto] items-center gap-y-2 py-3")}
            >
              <Link
                href={href}
                className="col-span-2 min-w-0 rounded-xs font-medium break-words hover:underline lg:col-span-1 lg:truncate"
                title={row.title ?? undefined}
              >
                {row.title ?? "Assignment"}
              </Link>
              <div className="col-start-1 row-start-2 lg:col-start-auto lg:row-start-auto">
                <AssignmentCompany name={row.companyName} mediaId={row.companyPictureId} />
              </div>
              <span className="col-start-1 row-start-3 truncate text-body-sm text-gray-700 lg:col-start-auto lg:row-start-auto lg:text-body lg:font-medium">
                {row.opportunityTitle ?? "—"}
              </span>
              <time
                dateTime={new Date(row._creationTime).toISOString()}
                className="col-start-1 row-start-4 text-body-sm text-gray-700 lg:col-start-auto lg:row-start-auto lg:text-body lg:whitespace-nowrap"
              >
                {date.format(row._creationTime)}
              </time>
              <div className="col-start-2 row-span-3 row-start-2 flex flex-wrap items-center justify-end gap-2 lg:col-start-auto lg:row-span-1 lg:row-start-auto">
                {row.queue === "approved" && !row.next && <Badge>Posted</Badge>}
                {row.queue === "review" && row.status === "active" && <Badge>In review</Badge>}
                {(row.status === "completed" || row.status === "cancelled") && (
                  <Badge>{assignmentStatusLabel[row.status]}</Badge>
                )}
                <Link
                  href={task && row.next ? `${href}&task=${task}&deliverable=${row.next.id}` : href}
                  className={buttonVariants({
                    size: "sm",
                    variant:
                      action === "Add post link" || action === "Resubmit"
                        ? "primary"
                        : "secondary-subtle",
                  })}
                >
                  {action}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      {(visible.length > 0 || hasMore) && (
        <div className="flex justify-center">
          <PaginationControl
            page={currentPage}
            pageCount={loadedPages + Number(hasMore)}
            onPageChange={(next) => {
              if (next > loadedPages) {
                if (status === "CanLoadMore") {
                  setPage(next);
                  loadMore(PAGE_SIZE);
                }
              } else setPage(next);
            }}
          />
        </div>
      )}
      {status === "LoadingMore" && (
        <p className="text-center text-body-sm text-gray-500" role="status">
          Loading assignments…
        </p>
      )}
    </div>
  );
}
