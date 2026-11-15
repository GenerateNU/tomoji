import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type LegendItemProps = ComponentProps<"span"> & {
  /** Blue square, a gray dashed line (projection), or a gray line (compare series). */
  variant?: "solid" | "dashed" | "context";
};

/** Figma "Legend Item": the key for one series in a chart legend. */
export function LegendItem({ variant = "solid", className, children, ...props }: LegendItemProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-body-xs font-normal text-gray-500",
        className,
      )}
      {...props}
    >
      {variant === "solid" ? (
        <span aria-hidden className="size-2.5 shrink-0 rounded-xs bg-blue-primary" />
      ) : (
        <svg aria-hidden width={14} height={2} className="shrink-0">
          <line
            x1={0}
            y1={1}
            x2={14}
            y2={1}
            strokeWidth={2}
            strokeDasharray={variant === "dashed" ? "3 2" : undefined}
            className={variant === "dashed" ? "stroke-gray-400" : "stroke-gray-300"}
          />
        </svg>
      )}
      {children}
    </span>
  );
}
