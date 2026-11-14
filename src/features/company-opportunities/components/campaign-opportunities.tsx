"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { RiAddLine, RiLayoutGridLine, RiListUnordered } from "@remixicon/react";
import { usePaginatedQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
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
import { PerformanceCard } from "@/features/campaigns/components/performance-card";
import { formatCompensation } from "@/lib/money";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import {
  OPPORTUNITY_TABS,
  opportunityTiming,
  type OpportunityTab,
} from "../lib/opportunity-status";
import { EditOpportunityModal } from "./edit-opportunity-modal";
import { OpportunityActions } from "./opportunity-actions";

const PAGE_SIZE = 12;
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

const EMPTY_COPY: Record<OpportunityTab, string> = {
  open: "No live opportunities yet",
  draft: "No draft opportunities",
  paused: "No paused opportunities",
  closed: "No ended opportunities",
};

/**
 * A campaign's opportunities by status, as cards or a table. Any company user
 * can add and manage them; the backend checks the campaign is theirs.
 */
export function CampaignOpportunities({
  campaignId,
  canCreate,
  onOpen,
}: {
  campaignId: Id<"campaigns">;
  /** False while the campaign loads, and once it has ended. */
  canCreate: boolean;
  onOpen: (opportunityId: Id<"opportunities">) => void;
}) {
  const [tab, setTab] = useState<OpportunityTab>("open");
  const [view, setView] = useState<"grid" | "list">("grid");
  // Read once so every card's "began N days ago" agrees.
  const [now] = useState(() => Date.now());
  const { results, status, loadMore } = usePaginatedQuery(
    api.opportunities.list,
    { campaignId, status: tab },
    { initialNumItems: PAGE_SIZE },
  );
  const newHref = `/campaigns/${campaignId}/opportunities/new`;
  const [editing, setEditing] = useState<Id<"opportunities"> | null>(null);
  const edit = (opportunityId: Id<"opportunities">) => setEditing(opportunityId);
  const editingTitle = results.find((opportunity) => opportunity._id === editing)?.title ?? "";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-8 px-4 py-10 sm:px-10 lg:px-12 lg:py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-heading-lg text-gray-950">Opportunities</h1>
        <p className="text-body text-gray-500">Manage and track your campaign’s opportunities</p>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          aria-label="Opportunity status"
          value={tab}
          onChange={(next) => setTab(next as OpportunityTab)}
        >
          {OPPORTUNITY_TABS.map(({ value, label }) => (
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
        {canCreate && (
          <Button className="sm:ml-auto" render={<Link href={newHref} />} nativeButton={false}>
            <RiAddLine aria-hidden />
            Create New Opportunity
          </Button>
        )}
      </div>

      {status === "LoadingFirstPage" ? (
        <div
          aria-busy="true"
          aria-label="Loading opportunities"
          className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4"
        >
          {[0, 1].map((key) => (
            <Skeleton key={key} className="h-72 rounded-lg" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <EmptyState className="flex flex-col items-center gap-4 py-24">
          <span>{EMPTY_COPY[tab]}</span>
          {canCreate && tab === "open" && (
            <Button
              variant="secondary-subtle"
              render={<Link href={newHref} />}
              nativeButton={false}
            >
              Create your first opportunity
            </Button>
          )}
        </EmptyState>
      ) : view === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-4">
          {results.map((opportunity) => (
            <PerformanceCard
              key={opportunity._id}
              id={opportunity._id}
              title={opportunity.title}
              subtitle={opportunityTiming(opportunity, now)}
              onOpen={() => onOpen(opportunity._id)}
              menu={
                <div className="flex items-center gap-2">
                  {opportunity.status === "paused" && <Badge>Paused</Badge>}
                  <OpportunityActions opportunity={opportunity} now={now} onEdit={edit} />
                </div>
              }
            />
          ))}
        </div>
      ) : (
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableHead className="w-[40%]">Opportunity</TableHead>
            <TableHead className="w-40">Deadline</TableHead>
            <TableHead className="w-28">Slots</TableHead>
            <TableHead className="w-40">Pay</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableHeader>
          <TableBody>
            {results.map((opportunity) => (
              <TableRow key={opportunity._id}>
                <TableCell secondary={opportunityTiming(opportunity, now)} avatar={null}>
                  <button
                    type="button"
                    onClick={() => onOpen(opportunity._id)}
                    className={cn("rounded-xs text-left hover:underline", focusRing)}
                  >
                    {opportunity.title}
                  </button>
                </TableCell>
                <TableCell>{date.format(opportunity.deadline)}</TableCell>
                <TableCell>
                  {opportunity.numFilledSlots}/{opportunity.maxSlots}
                </TableCell>
                <TableCell>{formatCompensation(opportunity, { variant: "compact" })}</TableCell>
                <TableCell type="custom">
                  <OpportunityActions opportunity={opportunity} now={now} onEdit={edit} />
                </TableCell>
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

      <EditOpportunityModal
        opportunityId={editing}
        title={editingTitle}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
