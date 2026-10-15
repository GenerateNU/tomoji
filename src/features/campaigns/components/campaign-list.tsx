"use client";

import { useState } from "react";
import { useConvexAuth, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";

const statuses: Record<Doc<"campaigns">["status"], string> = {
  draft: "Draft",
  open: "Open",
  paused: "Paused",
  closed: "Closed",
};
const budget = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/** Shows only the signed-in company's campaigns, with server-side status filtering. */
export function CampaignList() {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.me, isAuthenticated ? {} : "skip");
  const [status, setStatus] = useState<Doc<"campaigns">["status"] | "">("");
  const allowed = me?.synced && me.role === "company";
  const {
    results,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(api.campaigns.list, allowed ? (status ? { status } : {}) : "skip", {
    initialNumItems: 20,
  });

  if (!me)
    return (
      <p role="status" className="p-10">
        Loading campaigns…
      </p>
    );
  if (!me.synced)
    return (
      <p role="status" className="p-10">
        We&apos;re finishing setting up your account.
      </p>
    );
  if (!allowed)
    return (
      <p role="alert" className="p-10">
        A company account is required to view campaigns.
      </p>
    );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-5 py-10 sm:px-10 lg:py-16">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
        <p className="text-muted-foreground">Manage and track your creator campaigns.</p>
      </header>
      <div className="flex items-center gap-3 border-b pb-5">
        <label htmlFor="campaign-status" className="text-sm font-medium">
          Status
        </label>
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
            <div key={key} aria-hidden className="h-36 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p role="status" className="py-24 text-center text-muted-foreground">
          No campaigns to show
        </p>
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
                  <dd className="mt-1 font-medium">{budget.format(campaign.budgetCents / 100)}</dd>
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
          variant="outline"
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
