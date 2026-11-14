import type { ComponentProps, ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatTileProps = ComponentProps<"div"> & {
  label: ReactNode;
  value: ReactNode;
  icon?: ReactNode;
  /** Change versus the last period, e.g. { text: "+12%", direction: "up" }. */
  trend?: { text: string; direction: "up" | "down" };
  /** Vertical stacks the value under the label, for dashboard grids. */
  layout?: "horizontal" | "vertical";
};

/** Figma "Stat Tile": a single metric, with an optional trend tag. */
export function StatTile({
  label,
  value,
  icon,
  trend,
  layout = "vertical",
  className,
  ...props
}: StatTileProps) {
  const tag = trend && (
    <Badge tone={trend.direction === "up" ? "primary" : "destructive"}>
      <span className="sr-only">{trend.direction === "up" ? "Up" : "Down"} </span>
      {trend.text}
    </Badge>
  );
  return (
    <div
      data-slot="stat-tile"
      data-layout={layout}
      className={cn(
        "flex rounded-sm bg-background px-5 py-4 shadow-raised data-[layout=horizontal]:items-center data-[layout=horizontal]:justify-between data-[layout=vertical]:flex-col data-[layout=vertical]:gap-2",
        className,
      )}
      {...props}
    >
      <p className="flex items-center gap-1.5 text-body text-muted-foreground [&>svg]:size-4 [&>svg]:shrink-0">
        {icon}
        {label}
      </p>
      <p className="flex items-center gap-2">
        {layout === "horizontal" && tag}
        <span className="text-heading-md text-foreground">{value}</span>
        {layout === "vertical" && tag}
      </p>
    </div>
  );
}
