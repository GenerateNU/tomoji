"use client";

import { useState } from "react";
import Link from "next/link";
import { usePaginatedQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useMe } from "@/features/users/hooks/use-me";
import type { Doc } from "@convex/_generated/dataModel";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { formatMoney } from "@/lib/money";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";

const statuses: Record<Doc<"campaigns">["status"], string> = {
  draft: "Draft",
  open: "Open",
  paused: "Paused",
  closed: "Closed",
};
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/** The campaign list itself. `RequireAccount` has already proven the role. */
export function CompanyCampaigns() {
  const me = useMe();
  const [status, setStatus] = useState<Doc<"campaigns">["status"] | "">("");
  const {
    results,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(api.campaigns.list, status ? { status } : {}, {
    initialNumItems: 20,
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-5 py-10 sm:px-10 lg:py-16">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
          <p className="text-muted-foreground">Manage and track your creator campaigns.</p>
        </div>
        {me?.synced && me.role === "company" && me.companyRole === "admin" && (
          <Link href="/campaigns/new" className={buttonVariants({ className: "min-h-11" })}>
            Create campaign
          </Link>
        )}
      </header>
      <div className="flex items-center gap-3 border-b pb-5">
        <Label htmlFor="campaign-status">Status</Label>
        <select
          id="campaign-status"
          value={status}
          onChange={(event) => setStatus(event.target.value as typeof status)}
          className="min-h-11 rounded-lg border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <option value="">All statuses</option>
          {Object.entries(statuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {pageStatus === "LoadingFirstPage" ? (
        <div role="status" className="space-y-5">
          <span className="sr-only">Loading campaigns…</span>
          {[0, 1].map((key) => (
            <Skeleton key={key} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState className="py-24">No campaigns to show</EmptyState>
      ) : (
        <ul className="divide-y rounded-xl border px-5 sm:px-7">
          {results.map((campaign) => (
            <li key={campaign._id} className="space-y-5 py-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="min-w-0 break-words text-lg font-semibold">{campaign.title}</h2>
                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                  {statuses[campaign.status]}
                </span>
              </div>
              <dl className="grid gap-4 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">Budget</dt>
                  <dd className="mt-1 font-medium">{formatMoney(campaign.budgetCents)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Starts</dt>
                  <dd className="mt-1">{date.format(campaign.startsAt)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Ends</dt>
                  <dd className="mt-1">
                    {campaign.endsAt === undefined ? "No end date" : date.format(campaign.endsAt)}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
      {(pageStatus === "CanLoadMore" || pageStatus === "LoadingMore") && (
        <Button
          variant="secondary"
          className="min-h-11"
          disabled={pageStatus === "LoadingMore"}
          onClick={() => loadMore(20)}
        >
          {pageStatus === "LoadingMore" ? "Loading more…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
