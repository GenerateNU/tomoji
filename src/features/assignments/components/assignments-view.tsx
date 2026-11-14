"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { RiSearchLine } from "@remixicon/react";
import { usePaginatedQuery, useQuery } from "convex/react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequireAccount } from "@/features/users/components/require-account";
import { cn } from "@/lib/utils";
import { assignmentStatusLabel } from "./assignment-status";
import { AssignmentCompany } from "./assignment-company";

const PAGE_SIZE = 12;
const queues = [
  { value: "todo", label: "To-do" },
  { value: "review", label: "In Review" },
  { value: "posted", label: "Posted" },
  { value: "past", label: "Past" },
] as const;
type Queue = (typeof queues)[number]["value"];
type Stage = "detail" | "draft" | "post";

/** Lists creator assignments by the current submission and posting state. */
export function AssignmentsView({ stage = "detail" }: { stage?: Stage }) {
  return (
    <section className="flex w-full flex-col gap-8 px-4 pt-10 pb-12 sm:px-8 lg:px-[clamp(2rem,8.333vw,7.5rem)] lg:pt-30">
      <RequireAccount
        role="creator"
        next="/assignments"
        wrongRole="Assignments are available to creators."
      >
        <h1 className="text-4xl leading-tight font-medium tracking-tight">Assignments</h1>
        <Tabs defaultValue="todo" className="gap-8">
          <TabsList aria-label="Assignment status" className="overflow-x-auto">
            {queues.map(({ value, label }) => (
              <TabsTrigger key={value} value={value}>
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          {queues.map(({ value }) => (
            <TabsContent key={value} value={value}>
              <AssignmentList queue={value} stage={stage} />
            </TabsContent>
          ))}
        </Tabs>
      </RequireAccount>
    </section>
  );
}

type Filters = {
  search: string;
  companyId?: Id<"companies">;
  opportunityId?: Id<"opportunities">;
  order: "asc" | "desc";
};

/** Keeps filters in the toolbar and resets the cursor when criteria change. */
function AssignmentList({ queue, stage }: { queue: Queue; stage: Stage }) {
  const [filters, setFilters] = useState<Filters>({ search: "", order: "desc" });
  const [search, setSearch] = useState("");
  const options = useQuery(api.assignments.listMineFilterOptions);
  const id = useId();
  useEffect(() => {
    const timer = setTimeout(
      () => setFilters((value) => ({ ...value, search: search.trim() })),
      250,
    );
    return () => clearTimeout(timer);
  }, [search]);
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr]">
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
          label="Company"
          options={[{ id: "", label: "All companies" }, ...(options?.companies ?? [])]}
          value={filters.companyId ?? ""}
          onChange={(companyId) =>
            setFilters({ ...filters, companyId: (companyId || undefined) as Filters["companyId"] })
          }
        />
        <AssignmentSelect
          label="Opportunity"
          options={[{ id: "", label: "All opportunities" }, ...(options?.opportunities ?? [])]}
          value={filters.opportunityId ?? ""}
          onChange={(opportunityId) =>
            setFilters({
              ...filters,
              opportunityId: (opportunityId || undefined) as Filters["opportunityId"],
            })
          }
        />
        <AssignmentSelect
          label="Sort by"
          options={[
            { id: "desc", label: "Newest first" },
            { id: "asc", label: "Oldest first" },
          ]}
          value={filters.order}
          onChange={(order) => setFilters({ ...filters, order: order === "asc" ? "asc" : "desc" })}
        />
      </div>
      <AssignmentRows key={JSON.stringify(filters)} filters={filters} queue={queue} stage={stage} />
    </div>
  );
}

/** Uses the shared select treatment for the three assignment filters. */
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
  "grid gap-x-5 lg:grid-cols-[minmax(0,2.55fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(13.5rem,1.5fr)]";
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
  const { results, status, loadMore } = usePaginatedQuery(
    api.assignments.listMineSummaries,
    {
      ...filters,
      phase: queue === "past" ? "past" : "current",
      queue: queue === "past" ? undefined : queue,
    },
    { initialNumItems: PAGE_SIZE },
  );
  const loadedPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const currentPage = Math.min(page, loadedPages);
  const visible = results.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const hasMore = status === "CanLoadMore" || status === "LoadingMore";

  if (status === "LoadingFirstPage")
    return <Skeleton aria-label="Loading assignments" className="h-32 w-full" />;
  return (
    <div className="space-y-8">
      <div className={cn(columns, "hidden py-2 text-body-sm text-gray-500 lg:grid")} aria-hidden>
        <span>Name</span>
        <span>Company</span>
        <span>Assigned</span>
      </div>
      {visible.length === 0 && (
        <p className="py-4 text-body-sm text-gray-500">No assignments match this view.</p>
      )}
      <ul>
        {visible.map((row) => {
          const href = `/assignments/${row._id}`;
          const status = row.next?.status;
          const action =
            row.status === "active" && queue === "todo"
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
              <time
                dateTime={new Date(row._creationTime).toISOString()}
                className="col-start-1 row-start-3 text-body-sm text-gray-700 lg:col-start-auto lg:row-start-auto lg:text-body lg:whitespace-nowrap"
              >
                {date.format(row._creationTime)}
              </time>
              <div className="col-start-2 row-span-2 row-start-2 flex flex-wrap items-center justify-end gap-2 lg:col-start-auto lg:row-span-1 lg:row-start-auto">
                {status === "changesRequested" && <Badge tone="destructive">Changes needed</Badge>}
                {status === "approved" && <Badge tone="primary">Approved</Badge>}
                {row.queue === "review" && <Badge tone="primary">In review</Badge>}
                {row.queue === "posted" && <Badge tone="primary">Posted</Badge>}
                {row.status !== "active" && <Badge>{assignmentStatusLabel[row.status]}</Badge>}
                <Link
                  href={task && row.next ? `${href}?task=${task}&deliverable=${row.next.id}` : href}
                  className={buttonVariants({
                    size: "sm",
                    variant: action === "Add post link" ? "primary" : "secondary-subtle",
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
