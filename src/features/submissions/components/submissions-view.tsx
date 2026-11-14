"use client";

import { api } from "@convex/_generated/api";
import { RiSearchLine } from "@remixicon/react";
import { useQuery } from "convex/react";
import { useDeferredValue, useState } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { TextField } from "@/components/text-field";
import { CompanyAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PaginationControl } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequireAccount } from "@/features/users/components/require-account";
import { useNow } from "@/hooks/use-now";
import { formatRelativeTime } from "@/lib/relative-time";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { SubmissionReviewModal } from "./submission-review-modal";
import { labels, type SubmissionQueueRow } from "../lib/queue";

type Row = SubmissionQueueRow;
type Tab = "all" | Row["status"];
type SortKey = "title" | "campaignTitle" | "round" | "submittedAt" | "status";

const tabs: Tab[] = ["all", "pending", "changesRequested", "approved"];
const columns: { key: SortKey; label: string; width: string }[] = [
  { key: "title", label: "Submission", width: "w-[58%] md:w-[32%]" },
  { key: "campaignTitle", label: "Campaign", width: "hidden md:table-cell md:w-[20%]" },
  { key: "round", label: "Round", width: "hidden md:table-cell md:w-[14%]" },
  { key: "submittedAt", label: "Submitted", width: "hidden md:table-cell md:w-[17%]" },
  { key: "status", label: "Status", width: "w-[42%] md:w-[17%]" },
];
const pageSize = 12;

/** Sorts the filtered queue, using the newest submission first when values tie. */
function compareRows(a: Row, b: Row, field: SortKey, ascending: boolean): number {
  const first = a[field];
  const second = b[field];
  const order =
    typeof first === "number" && typeof second === "number"
      ? first - second
      : String(first).localeCompare(String(second));
  return (
    (ascending ? order : -order) ||
    b.submittedAt - a.submittedAt ||
    a.submissionId.localeCompare(b.submissionId)
  );
}

/** The counts, filters and table of submissions stay in sync as decisions change. */
function SubmissionQueue() {
  const queue = useQuery(api.submissions.listCompanyQueue);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [campaign, setCampaign] = useState("all");
  const [sort, setSort] = useState<{ field: SortKey; ascending: boolean }>({
    field: "submittedAt",
    ascending: false,
  });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Row>();
  const now = useNow();
  const needle = useDeferredValue(search).trim().toLowerCase();
  const rows = queue?.rows ?? [];
  const reviewRow =
    selected &&
    (rows.find(
      (row) =>
        row.assignmentId === selected.assignmentId && row.deliverableId === selected.deliverableId,
    ) ??
      selected);
  const scoped = rows.filter(
    (row) =>
      (campaign === "all" || row.campaignId === campaign) &&
      (!needle ||
        [row.title, row.creatorName, row.campaignTitle].some((value) =>
          value.toLowerCase().includes(needle),
        )),
  );
  const counts = { all: scoped.length, pending: 0, changesRequested: 0, approved: 0 };
  for (const { status } of scoped) counts[status]++;
  const filtered = scoped
    .filter((row) => tab === "all" || row.status === tab)
    .sort((a, b) => compareRows(a, b, sort.field, sort.ascending));
  const pageCount = Math.ceil(filtered.length / pageSize);
  const currentPage = Math.min(page, Math.max(pageCount, 1));
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const campaigns = [...new Map(rows.map((row) => [row.campaignId, row.campaignTitle]))].sort(
    ([, a], [, b]) => a.localeCompare(b),
  );
  const campaignOptions = [
    { value: "all", label: "All campaigns" },
    ...campaigns.map(([value, label]) => ({ value, label })),
  ];

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(value) => {
          setTab(value as Tab);
          setPage(1);
        }}
        className="gap-8"
      >
        <div className="overflow-x-auto">
          <TabsList aria-label="Submission status" className="w-max min-w-full gap-4 sm:gap-6">
            {tabs.map((status) => (
              <TabsTrigger key={status} value={status} className="max-sm:text-body-sm">
                {labels[status]} {queue && <TabsCount>{counts[status]}</TabsCount>}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value={tab} className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row">
            <TextField
              type="search"
              aria-label="Search submissions"
              placeholder="Search submissions"
              className="sm:w-100 [&_svg]:text-gray-400"
              icon={RiSearchLine}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
            <Select
              items={campaignOptions}
              value={campaign}
              onValueChange={(value) => {
                setCampaign(value ?? "all");
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filter by campaign" className="min-w-0 w-full sm:w-49">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {campaignOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {queue?.isCapped && (
            <p className="text-body-sm text-gray-500">
              Showing a limited set of recent assignments. Counts reflect these results.
            </p>
          )}
          {queue === undefined ? (
            <div className="grid gap-4" role="status" aria-label="Loading submissions">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <p className="py-6 text-body text-gray-500">
              {search.trim() || campaign !== "all"
                ? "No submissions match these filters."
                : "No submissions in this tab."}
            </p>
          ) : (
            <>
              <Table bare aria-label="Submissions" className="md:min-w-[670px]">
                <TableHeader>
                  {columns.map(({ key, label, width }) => (
                    <TableHead
                      key={key}
                      className={width}
                      sort={
                        sort.field === key
                          ? sort.ascending
                            ? "ascending"
                            : "descending"
                          : "unsorted"
                      }
                      onSort={() => {
                        setSort({ field: key, ascending: sort.field !== key || !sort.ascending });
                        setPage(1);
                      }}
                    >
                      {label}
                    </TableHead>
                  ))}
                </TableHeader>
                <TableBody>
                  {visible.map((row) => (
                    <TableRow key={row.submissionId}>
                      <TableCell
                        className="max-md:[&_span]:whitespace-normal"
                        avatar={<CompanyAvatar size={32} />}
                        secondary={
                          <>
                            {row.creatorName}
                            <span className="block md:hidden">
                              {row.campaignTitle} · Round {row.round}
                              {row.roundIsCapped ? "+" : ""}
                            </span>
                          </>
                        }
                      >
                        <button
                          type="button"
                          className={cn(
                            "max-w-full cursor-pointer rounded-xs text-left hover:underline",
                            focusRing,
                          )}
                          onClick={() => setSelected(row)}
                        >
                          {row.title}
                        </button>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{row.campaignTitle}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        Round {row.round}
                        {row.roundIsCapped ? "+" : ""}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <time dateTime={new Date(row.submittedAt).toISOString()}>
                          {formatRelativeTime(row.submittedAt, now)}
                        </time>
                      </TableCell>
                      <TableCell type="custom">
                        <Badge
                          className="max-sm:whitespace-normal"
                          tone={row.status === "pending" ? "primary" : "neutral"}
                        >
                          {labels[row.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {pageCount > 1 && (
                <PaginationControl
                  pageCount={pageCount}
                  page={currentPage}
                  onPageChange={setPage}
                  className="flex justify-center"
                />
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
      {selected && reviewRow && (
        <SubmissionReviewModal
          key={selected.submissionId}
          row={reviewRow}
          onClose={() => setSelected(undefined)}
        />
      )}
    </>
  );
}

/** The company submissions route and its account and retry states. */
export function SubmissionsView() {
  const [attempt, setAttempt] = useState(0);
  return (
    <RequireAccount
      role="company"
      next="/submissions"
      wrongRole="This page is only available to company accounts."
    >
      <section className="flex w-full flex-col gap-8 px-4 py-8 sm:px-8 lg:gap-10 lg:p-16">
        <h1 className="text-heading-lg">Submissions</h1>
        <ErrorBoundary
          key={attempt}
          fallback={() => (
            <div role="alert" className="space-y-3">
              <p>We couldn’t load submissions.</p>
              <Button onClick={() => setAttempt(attempt + 1)}>Try again</Button>
            </div>
          )}
        >
          <SubmissionQueue />
        </ErrorBoundary>
      </section>
    </RequireAccount>
  );
}
