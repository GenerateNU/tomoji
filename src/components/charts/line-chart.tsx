"use client";

import { useState, type ComponentProps, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  ChartTooltip,
  defaultFormat,
  tooltipAlign,
  type TooltipRow,
  type TooltipSeries,
} from "./chart-tooltip";
import { monotoneAreaPath, monotonePath, monotoneTangents, type PlotPoint } from "./paths";

const BAR_WIDTH = 40;

export type ChartProps = Omit<ComponentProps<"figure">, "children"> & {
  /** "line" draws an area line; "bar" draws blue bars. */
  type?: "line" | "bar";
  /** One value per point or bar. */
  values: number[];
  /** Line: last actual point. Later points are the dashed projection. */
  todayIndex?: number;
  /** X labels aligned to values; "" skips one. */
  labels?: string[];
  /** Y labels top to bottom; one gridline each. */
  yLabels?: string[];
  /** Domain bottom. Defaults to 0 for bars, else the smallest value. */
  min?: number;
  /** Domain top. Defaults to the largest value. */
  max?: number;
  /** LegendItem elements. */
  legend?: ReactNode;
  /** Series name in the tooltip and table. */
  seriesLabel?: string;
  /** Line: a gray context series behind the blue one. */
  compare?: { label: string; values: number[] };
  /** Full label per point for the tooltip and table; falls back to labels. */
  pointLabels?: string[];
  /** Formats values in the tooltip and table. */
  format?: (value: number) => string;
};

/**
 * Figma "Chart" (Line, Bar and Comparison), drawn from data without a chart
 * library. Hover, or focus the plot and use the arrow keys, to read a point.
 */
export function Chart({
  type = "line",
  values,
  todayIndex,
  labels = [],
  yLabels = [],
  min,
  max,
  legend,
  seriesLabel = "Value",
  compare,
  pointLabels,
  format = defaultFormat,
  className,
  "aria-label": ariaLabel,
  ...props
}: ChartProps) {
  const count = values.length;
  const compareValues = compare?.values.slice(0, count);
  const all = compareValues ? [...values, ...compareValues] : values;
  const domainMin = min ?? (type === "bar" ? 0 : Math.min(...all));
  const range = (max ?? Math.max(...all)) - domainMin || 1;
  const y = (value: number) => 100 - ((value - domainMin) / range) * 100;
  const x = (index: number) => (count > 1 ? (index / (count - 1)) * 100 : 50);
  const gridlines = Math.max(yLabels.length, 2);
  const today = Math.min(Math.max(todayIndex ?? count - 1, 0), count - 1);
  const pointLabel = (index: number) => pointLabels?.[index] || labels[index] || `#${index + 1}`;
  const [active, setActive] = useState<number | null>(null);
  // `values` can shrink while a point is active.
  const current = active !== null && active < count ? active : null;
  const compareAt = (index: number) => compare?.values[index];
  const clamp = (index: number) => Math.min(Math.max(index, 0), count - 1);
  const isProjected = (index: number) =>
    type === "line" && todayIndex !== undefined && index > today;

  const rowsAt = (index: number): TooltipRow[] => {
    const projected = isProjected(index);
    const series: TooltipSeries = projected ? "projected" : "primary";
    const rows: TooltipRow[] = [
      {
        label: projected ? `${seriesLabel} (projected)` : seriesLabel,
        value: format(values[index]),
        series,
      },
    ];
    const compared = compareAt(index);
    if (compare && compared !== undefined) {
      rows.push({
        label: compare.label,
        value: format(compared),
        series: "context",
      });
    }
    return rows;
  };

  let linePlot: ReactNode = null;
  if (type === "line" && count > 1) {
    const points: PlotPoint[] = values.map((value, index) => [x(index), y(value)]);
    const tangents = monotoneTangents(points);
    const compareSeries = compareValues?.map((value, index): PlotPoint => [x(index), y(value)]);
    const stroke = {
      fill: "none",
      vectorEffect: "non-scaling-stroke",
      strokeLinecap: "round",
      strokeLinejoin: "round",
    } as const;
    linePlot = (
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
        className="absolute inset-0 size-full overflow-visible"
      >
        {today > 0 && (
          <path d={monotoneAreaPath(points, tangents, 0, today)} className="fill-blue-subtle" />
        )}
        {today < count - 1 && (
          <path d={monotoneAreaPath(points, tangents, today, count - 1)} className="fill-gray-50" />
        )}
        {compareSeries && compareSeries.length > 1 && (
          <path
            d={monotonePath(
              compareSeries,
              monotoneTangents(compareSeries),
              0,
              compareSeries.length - 1,
            )}
            strokeWidth={2}
            className="stroke-gray-300"
            {...stroke}
          />
        )}
        {today > 0 && (
          <path
            d={monotonePath(points, tangents, 0, today)}
            strokeWidth={2.5}
            className="stroke-blue-primary"
            {...stroke}
          />
        )}
        {today < count - 1 && (
          <path
            d={monotonePath(points, tangents, today, count - 1)}
            strokeWidth={2}
            strokeDasharray="4 4"
            className="stroke-gray-400"
            {...stroke}
          />
        )}
        {todayIndex !== undefined && (
          <line
            x1={points[today][0]}
            x2={points[today][0]}
            y1={0}
            y2={100}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
            className="stroke-gray-950"
          />
        )}
      </svg>
    );
  }

  let crosshair: ReactNode = null;
  if (type === "line" && current !== null) {
    const left = x(current);
    const compared = compareAt(current);
    const dot = (value: number, color: string) => (
      <span
        className={cn(
          "absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-gray-0",
          color,
        )}
        style={{ left: `${left}%`, top: `${y(value)}%` }}
      />
    );
    crosshair = (
      <>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-px -translate-x-1/2 bg-gray-300"
          style={{ left: `${left}%` }}
        />
        <span aria-hidden className="pointer-events-none">
          {compared !== undefined && dot(compared, "bg-gray-300")}
          {dot(values[current], isProjected(current) ? "bg-gray-400" : "bg-blue-primary")}
        </span>
        <ChartTooltip
          title={pointLabel(current)}
          rows={rowsAt(current)}
          left={`${left}%`}
          top={`${Math.min(y(values[current]), compared !== undefined ? y(compared) : 100)}%`}
          align={tooltipAlign(left / 100)}
        />
      </>
    );
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (count === 0) return;
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (step) setActive((prev) => clamp((prev ?? today) + step));
    else if (event.key === "Home") setActive(0);
    else if (event.key === "End") setActive(count - 1);
    else if (event.key === "Escape") setActive(null);
    else return;
    event.preventDefault();
  };

  const axisText = "text-body-xs font-normal text-gray-400";

  return (
    <figure
      aria-label={ariaLabel}
      className={cn("flex flex-col gap-4 rounded bg-gray-0 px-5 pt-5 pb-4 shadow-tile", className)}
      {...props}
    >
      {legend ? <div className="flex flex-wrap items-center gap-4">{legend}</div> : null}
      <div className="flex gap-3">
        <div
          aria-hidden
          className={cn(axisText, "flex h-34 w-9 shrink-0 flex-col items-end justify-between")}
        >
          {yLabels.map((label, index) => (
            <span key={index}>{label}</span>
          ))}
        </div>
        <div
          role="group"
          tabIndex={0}
          aria-label={`${ariaLabel ?? "Chart"}. Use the arrow keys to read values.`}
          onPointerMove={(event) => {
            if (type !== "line" || count === 0) return;
            const box = event.currentTarget.getBoundingClientRect();
            setActive(clamp(Math.round(((event.clientX - box.left) / box.width) * (count - 1))));
          }}
          onPointerLeave={() => setActive(null)}
          onFocus={() => {
            if (count > 0) setActive((prev) => prev ?? today);
          }}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
          className="relative h-34 min-w-0 flex-1 rounded-xs outline-none focus-visible:ring-4 focus-visible:ring-blue-primary/25"
        >
          {Array.from({ length: gridlines }, (_, index) => (
            <div
              key={index}
              className="absolute inset-x-0 h-px bg-gray-100"
              style={{
                top: `calc(${(index / (gridlines - 1)) * 100}% - ${index === gridlines - 1 ? 1 : 0}px)`,
              }}
            />
          ))}
          {linePlot}
          {crosshair}
          {type === "bar" && (
            <div className="absolute inset-0 flex items-end justify-between">
              {values.map((value, index) => (
                <div
                  key={index}
                  onPointerEnter={() => setActive(index)}
                  className="relative -mx-2 flex h-full items-end px-2"
                >
                  <div
                    className={cn(
                      "w-10 bg-blue-primary transition-opacity",
                      current !== null && current !== index && "opacity-60",
                    )}
                    style={{ height: `${100 - y(value)}%` }}
                  />
                </div>
              ))}
              {current !== null && (
                <ChartTooltip
                  title={pointLabel(current)}
                  rows={rowsAt(current).map((row) => ({
                    ...row,
                    series: undefined,
                  }))}
                  left={`calc(${count > 1 ? current / (count - 1) : 0.5} * (100% - ${BAR_WIDTH}px) + ${BAR_WIDTH / 2}px)`}
                  top={`${y(values[current])}%`}
                  align={tooltipAlign(count > 1 ? current / (count - 1) : 0.5)}
                />
              )}
            </div>
          )}
        </div>
      </div>
      {labels.length > 0 && (
        <div aria-hidden className={cn(axisText, "relative ml-12 h-4")}>
          {type === "bar" ? (
            <div className="flex justify-between">
              {values.map((_, index) => (
                <span key={index} className="w-10 text-center">
                  {labels[index]}
                </span>
              ))}
            </div>
          ) : (
            labels.map(
              (label, index) =>
                label && (
                  <span
                    key={index}
                    className={cn(
                      "absolute top-0 whitespace-nowrap",
                      index === 0
                        ? ""
                        : index === count - 1
                          ? "-translate-x-full"
                          : "-translate-x-1/2",
                    )}
                    style={{ left: `${x(index)}%` }}
                  >
                    {label}
                  </span>
                ),
            )
          )}
        </div>
      )}
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Point</th>
            <th scope="col">{seriesLabel}</th>
            {compare && <th scope="col">{compare.label}</th>}
          </tr>
        </thead>
        <tbody>
          {values.map((value, index) => (
            <tr key={index}>
              <th scope="row">{pointLabel(index)}</th>
              <td>
                {format(value)}
                {isProjected(index) ? " (projected)" : ""}
              </td>
              {compare && (
                <td>{compareAt(index) === undefined ? "" : format(compareAt(index) as number)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** A `Chart` fixed to type="line". */
export function LineChart(props: Omit<ChartProps, "type">) {
  return <Chart {...props} type="line" />;
}
