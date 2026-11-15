import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type TooltipSeries = "primary" | "projected" | "context";

export type TooltipRow = { label: ReactNode; value: ReactNode; series?: TooltipSeries };

export type TooltipAlign = "start" | "center" | "end";

export const defaultFormat = (value: number) => value.toLocaleString("en-US");

/** Where a tooltip sits against its anchor, hugging an edge near the sides of the plot. */
export const tooltipAlign = (fraction: number): TooltipAlign =>
  fraction < 0.15 ? "start" : fraction > 0.85 ? "end" : "center";

function SeriesSwatch({ series }: { series: TooltipSeries }) {
  return (
    <svg aria-hidden width={10} height={2} className="shrink-0">
      <line
        x1={0}
        y1={1}
        x2={10}
        y2={1}
        strokeWidth={2}
        strokeDasharray={series === "projected" ? "3 2" : undefined}
        className={
          series === "primary"
            ? "stroke-blue-primary"
            : series === "context"
              ? "stroke-gray-300"
              : "stroke-gray-400"
        }
      />
    </svg>
  );
}

/**
 * Figma "Chart Tooltip": a gray title, then one row per series. It sits 8px
 * above `left`/`top` (CSS lengths inside the plot) and appears and disappears
 * instantly.
 */
export function ChartTooltip({
  title,
  rows,
  left,
  top,
  align = "center",
}: {
  title?: ReactNode;
  rows: TooltipRow[];
  left: string;
  top: string;
  align?: TooltipAlign;
}) {
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none absolute z-10 flex min-w-28 -translate-y-[calc(100%+8px)] flex-col gap-1 rounded-md bg-gray-0 px-3 py-2 whitespace-nowrap shadow-overlay",
        align === "center" && "-translate-x-1/2",
        align === "end" && "-translate-x-full",
      )}
      style={{ left, top }}
    >
      {title ? <span className="text-body-xs font-normal text-gray-500">{title}</span> : null}
      {rows.map((row, index) => (
        <span key={index} className="flex items-center gap-2">
          {row.series ? <SeriesSwatch series={row.series} /> : null}
          <span className="text-body-sm font-semibold text-gray-950">{row.value}</span>
          <span className="text-body-xs font-normal text-gray-500">{row.label}</span>
        </span>
      ))}
    </div>
  );
}
