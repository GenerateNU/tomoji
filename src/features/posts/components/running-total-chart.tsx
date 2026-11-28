"use client";

import { LineChart } from "@/components/charts/line-chart";
import { LegendItem } from "@/components/charts/legend";
import { earningsSeries } from "@/features/earnings/lib/earnings-series";
import { cn } from "@/lib/utils";

/**
 * A running total per local day from `from` (or the first event) to today, for
 * a figure with history: views from X counts, or earnings from payouts.
 */
export function RunningTotalChart({
  events,
  from,
  now,
  label,
  format,
  formatAxis,
  className,
}: {
  /** Increases, oldest first. */
  events: { at: number; amount: number }[];
  from: number | null;
  now: Date;
  /** Names the series, e.g. "Views". */
  label: string;
  format: (value: number) => string;
  formatAxis?: (value: number) => string;
  className?: string;
}) {
  const series = earningsSeries(events, from, now, formatAxis);
  return (
    <LineChart
      aria-label={label}
      values={series.values}
      labels={series.labels}
      pointLabels={series.pointLabels}
      yLabels={series.yLabels}
      min={0}
      max={series.max}
      legend={<LegendItem>{label}</LegendItem>}
      seriesLabel={label}
      format={format}
      className={cn("p-0 shadow-none", className)}
    />
  );
}
