import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SeriesKey, type SeriesKind } from "./legend";

/** Figma "Chart Tooltip": a gray title (a date or category), then one row per series. */
export function ChartTooltip({
  title,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { title?: ReactNode }) {
  return (
    <div
      className={cn(
        "pointer-events-none flex min-w-28 flex-col gap-1 rounded-md bg-popover px-3 py-2 whitespace-nowrap shadow-overlay",
        className,
      )}
      {...props}
    >
      {title && <p className="text-body-xs text-muted-foreground">{title}</p>}
      {children}
    </div>
  );
}

/** Figma "Chart Tooltip Row": the series key, the value in bold, then its label. */
export function ChartTooltipRow({
  kind,
  value,
  label,
}: {
  /** Omit for bar charts and single values. */
  kind?: SeriesKind;
  value: ReactNode;
  label: ReactNode;
}) {
  return (
    <p className="flex items-center gap-2">
      {kind && <SeriesKey kind={kind} />}
      <span className="text-body-sm font-semibold text-foreground">{value}</span>
      <span className="text-body-xs text-muted-foreground">{label}</span>
    </p>
  );
}

/**
 * Places a tooltip 8px above a point given in percent of the plot, hugging the
 * left or right edge near the plot's sides so it never overflows the card.
 */
export function tooltipPosition(xPercent: number, yPercent: number) {
  const shift = xPercent < 15 ? "0%" : xPercent > 85 ? "-100%" : "-50%";
  return {
    left: `${xPercent}%`,
    top: `calc(${yPercent}% - 8px)`,
    transform: `translate(${shift}, -100%)`,
  };
}
