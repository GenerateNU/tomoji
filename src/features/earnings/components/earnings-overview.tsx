"use client";

import { useState } from "react";
import { LineChart } from "@/components/charts/line-chart";
import { LegendItem } from "@/components/charts/legend";
import { SelectField } from "@/components/select-field";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  RANGE_CAPTIONS,
  RANGE_OPTIONS,
  formatPercent,
  percentChange,
  type EarningsRange,
} from "../lib/earnings-range";
import { earningsSeries } from "../lib/earnings-series";
import { useCachedSummary } from "../hooks/use-cached-summary";
import { TopEarningPosts } from "./top-earning-posts";

/**
 * The creator's total for a range, its change from the previous one, and a
 * running-total chart; then the posts that earned the most, with their own range.
 */
export function EarningsOverview() {
  return (
    <>
      <EarningsTotal />
      <hr className="border-gray-100" />
      <TopEarningPosts />
    </>
  );
}

function EarningsTotal() {
  const [range, setRange] = useState<EarningsRange>("month");
  // Fixed when the page opens so the query's arguments stay the same between renders.
  const [now] = useState(() => new Date());
  const { summary, isStale, starts } = useCachedSummary(range, now);

  const change = summary ? percentChange(summary.total, summary.previousTotal) : null;
  const series = summary ? earningsSeries(summary.earnings, starts.from, now) : null;

  return (
    <section aria-labelledby="total-earnings" className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div
          aria-busy={summary === undefined || isStale}
          className={cn("flex flex-col gap-1", isStale && "opacity-60 transition-opacity")}
        >
          {summary === undefined ? (
            <Skeleton className="h-12 w-36" />
          ) : (
            <p className="text-heading-xl text-gray-950">{formatMoney(summary.total)}</p>
          )}
          <div className="flex items-center gap-1.5">
            <h2 id="total-earnings" className="text-body-lg font-medium text-gray-950">
              Total Earnings
            </h2>
            {change !== null && (
              <p className="text-body-xs text-gray-500">
                <span aria-hidden>{change >= 0 ? "↗" : "↘"}</span>{" "}
                <span className="sr-only">{change >= 0 ? "Up" : "Down"} </span>
                {formatPercent(change)}
                <span className="sr-only"> from the previous {range}</span>
              </p>
            )}
          </div>
          <p className="text-body-xs text-gray-500">Total earnings {RANGE_CAPTIONS[range]}</p>
        </div>
        <SelectField
          // The design has no visible label; screen readers still need one.
          label={<span className="sr-only">Earnings range</span>}
          options={RANGE_OPTIONS}
          value={range}
          onValueChange={(next) => next && setRange(next as EarningsRange)}
          className="w-50 gap-0"
        />
      </div>

      {series === null ? (
        <Skeleton className="h-52 w-full" />
      ) : (
        <LineChart
          aria-label={`Earnings ${RANGE_CAPTIONS[range]}`}
          values={series.values}
          labels={series.labels}
          pointLabels={series.pointLabels}
          yLabels={series.yLabels}
          min={0}
          max={series.max}
          legend={<LegendItem>Earnings</LegendItem>}
          seriesLabel="Earnings"
          format={formatMoney}
          className={cn("p-0 shadow-none", isStale && "opacity-60 transition-opacity")}
        />
      )}
      {summary?.isPartial && (
        <p className="text-body-xs text-gray-500">
          Showing your most recent 2,000 payouts. Pick a shorter range to see all of them.
        </p>
      )}
    </section>
  );
}
