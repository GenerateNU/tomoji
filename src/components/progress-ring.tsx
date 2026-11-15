import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: 40, stroke: 3, label: "text-body-xs" },
  md: { box: 56, stroke: 4, label: "text-body-sm" },
} as const;

type ProgressRingProps = ComponentProps<"div"> & {
  /** Percent complete, 0–100. */
  value: number;
  size?: keyof typeof SIZES;
  /** Shows the percentage in the middle. */
  showLabel?: boolean;
  /** What is progressing, for screen readers, e.g. "Profile completion". */
  label: string;
};

/** Figma "Progress Ring": a blue arc on a gray track, filling clockwise from 12 o'clock. */
export function ProgressRing({
  value,
  size = "sm",
  showLabel = true,
  label,
  className,
  ...props
}: ProgressRingProps) {
  const { box, stroke, label: labelSize } = SIZES[size];
  const percent = Math.min(100, Math.max(0, value));
  const radius = (box - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const rounded = Math.round(percent);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={rounded}
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: box, height: box }}
      {...props}
    >
      <svg aria-hidden viewBox={`0 0 ${box} ${box}`} className="absolute inset-0 -rotate-90">
        <circle
          cx={box / 2}
          cy={box / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-gray-100"
        />
        {percent > 0 && (
          <circle
            cx={box / 2}
            cy={box / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeDasharray={`${(percent / 100) * circumference} ${circumference}`}
            className="stroke-blue-primary transition-[stroke-dasharray] duration-300 motion-reduce:transition-none"
          />
        )}
      </svg>
      {showLabel && (
        <span aria-hidden className={cn("relative font-semibold text-gray-950", labelSize)}>
          {rounded}%
        </span>
      )}
    </div>
  );
}
