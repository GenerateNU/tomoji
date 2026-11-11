"use client";

import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ChartTooltip, ChartTooltipRow, tooltipPosition } from "./chart-tooltip";
import { ChartLegend, LegendItem, type SeriesKind } from "./legend";
import { smoothAreaPath, smoothLinePath, VIEW_WIDTH, type ChartPoint } from "./paths";

const PLOT_HEIGHT = 136;

export type LineSeries = {
  label: string;
  /**
   * `primary` is the main series, shaded beneath; `context` is a gray
   * comparison, such as an average; `projected` is a dashed forecast, shaded
   * gray. Use null where a series has no value, e.g. a projection before today.
   */
  kind: SeriesKind;
  values: (number | null)[];
};

type LineChartProps = {
  /** One label per point, shown in the tooltip, e.g. "Oct 12". */
  labels: string[];
  series: LineSeries[];
  /** The value at the top gridline. */
  max: number;
  /** Three y-axis labels, top to bottom, e.g. ["$600", "$300", "$0"]. */
  yTicks: [string, string, string];
  /** The points to label on the x axis. */
  xTicks: { index: number; label: string }[];
  /** Draws a black "Today" rule at this point. */
  todayIndex?: number;
  formatValue: (value: number) => string;
  /** Describes the chart for screen readers, e.g. "Earnings over the last two months". */
  title: string;
  className?: string;
};

function pointsOf(values: (number | null)[], max: number): ChartPoint[] {
  const last = Math.max(1, values.length - 1);
  return values.flatMap((value, index) =>
    value === null ? [] : [{ x: index / last, y: Math.min(1, value / max) }],
  );
}

/**
 * Figma "Chart" (Line and Comparison): smooth lines over three gridlines, with
 * a crosshair, markers and a tooltip on hover. Arrow keys move the crosshair
 * when the plot has focus.
 */
export function LineChart({
  labels,
  series,
  max,
  yTicks,
  xTicks,
  todayIndex,
  formatValue,
  title,
  className,
}: LineChartProps) {
  const [active, setActive] = useState<number | null>(null);
  const last = Math.max(1, labels.length - 1);
  const xPercent = (index: number) => (index / last) * 100;

  const pickFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    setActive(Math.min(last, Math.max(0, Math.round(ratio * last))));
  };

  const moveWithKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, Home: -Infinity, End: Infinity }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    setActive((current) => Math.min(last, Math.max(0, (current ?? todayIndex ?? last) + step)));
  };

  const hovered =
    active === null
      ? []
      : series.flatMap((line) => {
          const value = line.values[active];
          return value === null || value === undefined ? [] : [{ line, value }];
        });
  const highest = Math.max(...hovered.map(({ value }) => value), 0);

  return (
    <figure
      className={cn("flex flex-col gap-4 rounded-sm bg-card px-5 pt-5 pb-4 shadow-card", className)}
    >
      <ChartLegend>
        {series.map((line) => (
          <LegendItem key={line.label} kind={line.kind === "primary" ? "series" : line.kind}>
            {line.label}
          </LegendItem>
        ))}
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

        <div className="relative min-w-0 flex-1 pr-1.5">
          <div
            role="img"
            aria-label={title}
            tabIndex={0}
            onPointerMove={pickFromPointer}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(todayIndex ?? last)}
            onBlur={() => setActive(null)}
            onKeyDown={moveWithKeys}
            className="relative h-34 rounded-xs outline-none focus-visible:ring-4 focus-visible:ring-ring/25"
          >
            <svg
              aria-hidden
              viewBox={`0 0 ${VIEW_WIDTH} ${PLOT_HEIGHT}`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
            >
              {[0, PLOT_HEIGHT / 2, PLOT_HEIGHT].map((y) => (
                <line
                  key={y}
                  x1="0"
                  x2={VIEW_WIDTH}
                  y1={y}
                  y2={y}
                  vectorEffect="non-scaling-stroke"
                  className="stroke-gray-100"
                />
              ))}
              {series.map((line) => {
                const points = pointsOf(line.values, max);
                if (line.kind === "context") return null;
                return (
                  <path
                    key={`${line.label}-area`}
                    d={smoothAreaPath(points, PLOT_HEIGHT)}
                    className={line.kind === "primary" ? "fill-blue-subtle" : "fill-gray-50"}
                  />
                );
              })}
              {series.map((line) => (
                <path
                  key={line.label}
                  d={smoothLinePath(pointsOf(line.values, max), PLOT_HEIGHT)}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={line.kind === "projected" ? 2 : 2.5}
                  strokeDasharray={line.kind === "projected" ? "2 4" : undefined}
                  className={cn(
                    line.kind === "primary" && "stroke-primary",
                    line.kind === "context" && "stroke-gray-300",
                    line.kind === "projected" && "stroke-gray-400",
                  )}
                />
              ))}
            </svg>

            {todayIndex !== undefined && (
              <span
                aria-hidden
                className="absolute inset-y-0 w-px bg-foreground"
                style={{ left: `${xPercent(todayIndex)}%` }}
              />
            )}

            {active !== null && (
              <>
                <span
                  aria-hidden
                  className="absolute inset-y-0 w-px bg-gray-300"
                  style={{ left: `${xPercent(active)}%` }}
                />
                {hovered.map(({ line, value }) => (
                  <span
                    key={line.label}
                    aria-hidden
                    className={cn(
                      "absolute size-3.5 -translate-1/2 rounded-full border-2 border-background",
                      line.kind === "primary" && "bg-primary",
                      line.kind === "context" && "bg-gray-300",
                      line.kind === "projected" && "bg-gray-400",
                    )}
                    style={{
                      left: `${xPercent(active)}%`,
                      top: `${(1 - Math.min(1, value / max)) * 100}%`,
                    }}
                  />
                ))}
                {hovered.length > 0 && (
                  <ChartTooltip
                    title={labels[active]}
                    className="absolute z-10"
                    style={tooltipPosition(
                      xPercent(active),
                      (1 - Math.min(1, highest / max)) * 100,
                    )}
                  >
                    {hovered.map(({ line, value }) => (
                      <ChartTooltipRow
                        key={line.label}
                        kind={line.kind}
                        value={formatValue(value)}
                        label={line.label}
                      />
                    ))}
                  </ChartTooltip>
                )}
              </>
            )}
          </div>

          <div aria-hidden className="relative mt-4 h-4 text-body-xs text-gray-400">
            {xTicks.map((tick) => (
              <span
                key={tick.label}
                className="absolute -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${xPercent(tick.index)}%` }}
              >
                {tick.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <ChartDataTable
        caption={title}
        labels={labels}
        columns={series.map((line) => ({
          label: line.label,
          values: line.values.map((value) => (value === null ? "—" : formatValue(value))),
        }))}
      />
    </figure>
  );
}

/** The chart's numbers as a table, for screen readers. */
export function ChartDataTable({
  caption,
  labels,
  columns,
}: {
  caption: ReactNode;
  labels: string[];
  columns: { label: string; values: string[] }[];
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Point</th>
          {columns.map((column) => (
            <th key={column.label} scope="col">
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((label, index) => (
          <tr key={`${label}-${index}`}>
            <th scope="row">{label}</th>
            {columns.map((column) => (
              <td key={column.label}>{column.values[index]}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
