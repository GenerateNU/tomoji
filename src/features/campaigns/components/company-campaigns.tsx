"use client";

import { api } from "@convex/_generated/api";
import { RiAddLine, RiLayoutGridLine, RiListUnordered } from "@remixicon/react";
import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Segment, SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMe } from "@/features/users/hooks/use-me";
import { formatMoney } from "@/lib/money";
import { CAMPAIGN_TABS, campaignTiming, type CampaignTab } from "../lib/campaign-status";
import { CampaignActions } from "./campaign-actions";
import { PerformanceCard } from "./performance-card";

const PAGE_SIZE = 12;
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/** The company's campaigns by status, as cards or a table. `RequireAccount` has proven the role. */
export function CompanyCampaigns() {
  const me = useMe();
  const [tab, setTab] = useState<CampaignTab>("open");
  const [view, setView] = useState<"grid" | "list">("grid");
  // Read once so every card's "began N days ago" agrees.
  const [now] = useState(() => Date.now());
  const { results, status, loadMore } = usePaginatedQuery(
    api.campaigns.list,
    { status: tab },
    { initialNumItems: PAGE_SIZE },
  );
  const isAdmin = me?.synced === true && me.role === "company" && me.companyRole === "admin";

  return (
    <div className="flex w-full flex-col gap-8 px-4 py-12 sm:px-10 lg:px-16 lg:py-16">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-heading-lg text-gray-950">Campaigns</h1>
          <p className="text-body text-gray-500">Manage and track your creator campaigns</p>
        </div>
        {isAdmin && (
          <Button render={<Link href="/campaigns/new" />} nativeButton={false}>
            <RiAddLine aria-hidden />
            Create New Campaign
          </Button>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          aria-label="Campaign status"
          value={tab}
          onChange={(next) => setTab(next as CampaignTab)}
        >
          {CAMPAIGN_TABS.map(({ value, label }) => (
            <Segment key={value} value={value} label={label} />
          ))}
        </SegmentedControl>
        <SegmentedControl
          aria-label="View"
          value={view}
          onChange={(next) => setView(next as "grid" | "list")}
        >
          <Segment value="grid" label="Grid view" icon={RiLayoutGridLine} />
          <Segment value="list" label="List view" icon={RiListUnordered} />
        </SegmentedControl>
      </div>

      {status === "LoadingFirstPage" ? (
        <div
          aria-busy="true"
          aria-label="Loading campaigns"
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-72 rounded-lg" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState className="py-24">No campaigns to show</EmptyState>
      ) : view === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map((campaign) => (
            <PerformanceCard
              key={campaign._id}
              id={campaign._id}
              title={campaign.title}
              subtitle={campaignTiming(campaign, now)}
              menu={<CampaignActions campaign={campaign} isAdmin={isAdmin} />}
            />
          ))}
        </div>
      ) : (
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableHead className="w-[40%]">Campaign</TableHead>
            <TableHead className="w-40">Starts</TableHead>
            <TableHead className="w-40">Ends</TableHead>
            <TableHead className="w-32">Budget</TableHead>
          </TableHeader>
          <TableBody>
            {results.map((campaign) => (
              <TableRow key={campaign._id}>
                <TableCell secondary={campaignTiming(campaign, now)} avatar={null}>
                  {campaign.title}
                </TableCell>
                <TableCell>{date.format(campaign.startsAt)}</TableCell>
                <TableCell>
                  {campaign.endsAt === undefined ? "No end date" : date.format(campaign.endsAt)}
                </TableCell>
                <TableCell>{formatMoney(campaign.budgetCents)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <Button
          variant="secondary-subtle"
          className="self-center"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(PAGE_SIZE)}
        >
          {status === "LoadingMore" ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
