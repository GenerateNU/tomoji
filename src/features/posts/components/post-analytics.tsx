"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useState, type ReactNode } from "react";
import { SelectField } from "@/components/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCachedSummary } from "@/features/earnings/hooks/use-cached-summary";
import {
  RANGE_CAPTIONS,
  RANGE_OPTIONS,
  rangeStarts,
  type EarningsRange,
} from "@/features/earnings/lib/earnings-range";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  ENGAGEMENT_LABELS,
  engagementTotal,
  formatCompactCount,
  formatCount,
  type CreatorPost,
  type EngagementMetric,
} from "../lib/post-list";
import { RunningTotalChart } from "./running-total-chart";

type Metric = EngagementMetric | "views" | "earnings";

// The design's order. Views and earnings have history; the rest are current totals.
const TABS: { value: Metric; label: string }[] = [
  { value: "likes", label: "Likes" },
  { value: "views", label: "Views" },
  { value: "comments", label: "Comments" },
  { value: "reposts", label: "Reposts" },
  { value: "quotes", label: "Quotes" },
  { value: "earnings", label: "Earnings" },
];

/**
 * Totals across the creator's posts. Views and earnings chart over a chosen
 * range; X only reports likes, comments, reposts and quotes as current totals,
 * so those tabs show the total without a trend.
 */
export function PostAnalytics({ posts }: { posts: CreatorPost[] | undefined }) {
  const [metric, setMetric] = useState<Metric>("likes");
  const [range, setRange] = useState<EarningsRange>("month");
  // Fixed when the page opens so the query's arguments stay the same between renders.
  const [now] = useState(() => new Date());

  return (
    <section aria-labelledby="post-analytics" className="flex flex-col gap-6">
      <h2 id="post-analytics" className="text-heading-sm text-gray-950">
        Post analytics
      </h2>
      <Tabs value={metric} onValueChange={(next) => setMetric(next as Metric)}>
        <TabsList aria-label="Metric" className="overflow-x-auto">
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="pt-4">
            {tab.value === "views" ? (
              <ViewsPanel range={range} onRangeChange={setRange} now={now} />
            ) : tab.value === "earnings" ? (
              <EarningsPanel range={range} onRangeChange={setRange} now={now} />
            ) : (
              <EngagementPanel posts={posts} metric={tab.value} />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function ViewsPanel({ range, onRangeChange, now }: RangeProps & { now: Date }) {
  const { from } = rangeStarts(range, now);
  const history = useQuery(api.posts.viewHistory, { from });
  return (
    <Panel
      value={history === undefined ? undefined : formatCount(history.total)}
      label="Views"
      caption={`Total views ${RANGE_CAPTIONS[range]}`}
      range={<RangeSelect range={range} onRangeChange={onRangeChange} />}
      chart={
        history === undefined ? (
          <Skeleton className="h-52 w-full" />
        ) : (
          <RunningTotalChart
            events={history.views}
            from={from}
            now={now}
            label="Views"
            format={formatCount}
            formatAxis={formatCompactCount}
          />
        )
      }
      note={
        history?.isPartial ? "Showing the most recent view counts. Pick a shorter range." : null
      }
    />
  );
}

function EarningsPanel({ range, onRangeChange, now }: RangeProps & { now: Date }) {
  const { summary, isStale, starts } = useCachedSummary(range, now);
  return (
    <Panel
      value={summary === undefined ? undefined : formatMoney(summary.total)}
      label="Earnings"
      caption={`Total earnings ${RANGE_CAPTIONS[range]}`}
      range={<RangeSelect range={range} onRangeChange={onRangeChange} />}
      stale={isStale}
      chart={
        summary === undefined ? (
          <Skeleton className="h-52 w-full" />
        ) : (
          <RunningTotalChart
            events={summary.earnings}
            from={starts.from}
            now={now}
            label="Earnings"
            format={formatMoney}
          />
        )
      }
      note={
        summary?.isPartial
          ? "Showing your most recent 2,000 payouts. Pick a shorter range to see all of them."
          : null
      }
    />
  );
}

function EngagementPanel({
  posts,
  metric,
}: {
  posts: CreatorPost[] | undefined;
  metric: EngagementMetric;
}) {
  const label = ENGAGEMENT_LABELS[metric];
  return (
    <Panel
      value={posts === undefined ? undefined : formatCount(engagementTotal(posts, metric))}
      label={label}
      caption={`Total ${label.toLowerCase()} across your posts, as last read from X`}
    />
  );
}

type RangeProps = { range: EarningsRange; onRangeChange: (range: EarningsRange) => void };

function RangeSelect({ range, onRangeChange }: RangeProps) {
  return (
    <SelectField
      // The design has no visible label; screen readers still need one.
      label={<span className="sr-only">Analytics range</span>}
      options={RANGE_OPTIONS}
      value={range}
      onValueChange={(next) => next && onRangeChange(next as EarningsRange)}
      className="w-50 gap-0"
    />
  );
}

function Panel({
  value,
  label,
  caption,
  range,
  chart,
  note,
  stale = false,
}: {
  /** Undefined while loading. */
  value: string | undefined;
  label: string;
  caption: string;
  range?: ReactNode;
  chart?: ReactNode;
  note?: string | null;
  stale?: boolean;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div
          aria-busy={value === undefined || stale}
          className={cn("flex flex-col gap-1", stale && "opacity-60 transition-opacity")}
        >
          {value === undefined ? (
            <Skeleton className="h-12 w-36" />
          ) : (
            <p className="text-heading-xl text-gray-950">{value}</p>
          )}
          <p className="text-body-lg font-medium text-gray-950">{label}</p>
          <p className="text-body-xs text-gray-500">{caption}</p>
        </div>
        {range}
      </div>
      {chart && <div className={cn(stale && "opacity-60 transition-opacity")}>{chart}</div>}
      {note && <p className="text-body-xs text-gray-500">{note}</p>}
    </div>
  );
}
