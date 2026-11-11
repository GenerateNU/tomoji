"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChartTooltip, ChartTooltipRow, tooltipPosition } from "./chart-tooltip";
import { ChartLegend, LegendItem } from "./legend";
import { ChartDataTable } from "./line-chart";

type BarChartProps = {
  data: { label: string; value: number }[];
  /** What the bars measure, e.g. "Views"; shown in the legend and tooltip. */
  seriesLabel: string;
  /** The value at the top gridline. */
  max: number;
  /** Three y-axis labels, top to bottom. */
  yTicks: [string, string, string];
  formatValue: (value: number) => string;
  title: string;
  className?: string;
};

/** Figma "Chart" (Bar): blue bars rounded on top, with a tooltip on hover or focus. */
export function BarChart({
  data,
  seriesLabel,
  max,
  yTicks,
  formatValue,
  title,
  className,
}: BarChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const share = (value: number) => Math.min(1, value / max) * 100;

  return (
    <figure
      className={cn("flex flex-col gap-4 rounded-sm bg-card px-5 pt-5 pb-4 shadow-card", className)}
    >
      <ChartLegend>
        <LegendItem kind="series">{seriesLabel}</LegendItem>
      </ChartLegend>
      <div className="flex gap-3">
        <div
          aria-hidden
          className="flex h-34 w-9 shrink-0 flex-col justify-between text-right text-body-xs text-gray-400"
        >
          {yTicks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
        <div className="min-w-0 flex-1 pr-1.5">
          <div
            aria-hidden
            className="relative flex h-34 items-end justify-between border-y border-gray-100 bg-[linear-gradient(var(--color-gray-100),var(--color-gray-100))] bg-[length:100%_1px] bg-center bg-no-repeat"
          >
            {data.map((bar, index) => (
              <div
                key={bar.label}
                className="relative flex h-full w-[8%] items-end"
                onPointerEnter={() => setActive(index)}
                onPointerLeave={() => setActive(null)}
              >
                <span
                  className={cn(
                    "w-full rounded-t-xs bg-primary transition-opacity",
                    active !== null && active !== index && "opacity-60",
                  )}
                  style={{ height: `${share(bar.value)}%` }}
                />
                {active === index && (
                  <ChartTooltip
                    title={bar.label}
                    className="absolute z-10"
                    style={tooltipPosition(50, 100 - share(bar.value))}
                  >
                    <ChartTooltipRow value={formatValue(bar.value)} label={seriesLabel} />
                  </ChartTooltip>
                )}
              </div>
            ))}
          </div>
          <div aria-hidden className="mt-4 flex justify-between text-body-xs text-gray-400">
            {data.map((bar) => (
              <span key={bar.label} className="w-[8%] text-center">
                {bar.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <ChartDataTable
        caption={title}
        labels={data.map((bar) => bar.label)}
        columns={[{ label: seriesLabel, values: data.map((bar) => formatValue(bar.value)) }]}
      />
    </figure>
  );
}
