import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type SeriesKind = "primary" | "context" | "projected";

/** The short line or square that stands for a series in legends and tooltips. */
export function SeriesKey({
  kind,
  shape = "line",
}: {
  kind: SeriesKind;
  shape?: "line" | "square";
}) {
  if (shape === "square") {
    return <span aria-hidden className="size-2.5 shrink-0 rounded-xs bg-primary" />;
  }
  return (
    <svg aria-hidden viewBox="0 0 14 2" className="h-0.5 w-3.5 shrink-0 overflow-visible">
      <line
        x1="0"
        y1="1"
        x2="14"
        y2="1"
        strokeWidth="2"
        className={cn(
          kind === "primary" && "stroke-primary",
          kind === "context" && "stroke-gray-300",
          kind === "projected" && "stroke-gray-400",
        )}
        strokeDasharray={kind === "projected" ? "2.8 1.87" : undefined}
        strokeDashoffset={kind === "projected" ? 1.4 : undefined}
      />
    </svg>
  );
}

/** Figma legend row: a key and a gray label per series, 16px apart. */
export function ChartLegend({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("flex flex-wrap items-center gap-4", className)} {...props} />;
}

/** Figma "Legend Item": solid square for a series, dashed for projections, gray for context. */
export function LegendItem({
  kind,
  children,
}: {
  kind: SeriesKind | "series";
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-1.5 text-body-xs text-muted-foreground">
      {kind === "series" ? <SeriesKey kind="primary" shape="square" /> : <SeriesKey kind={kind} />}
      {children}
    </li>
  );
}
