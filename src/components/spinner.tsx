import { collapsedMark } from "@/components/logo";
import { cn } from "@/lib/utils";

type SpinnerProps = {
  /** Height of the [o] mark in px; the width follows. */
  size?: 16 | 20 | 24 | 32 | 40 | 48;
  /** Accessible name; the spinner has role="status". */
  label?: string;
  className?: string;
};

/**
 * Indeterminate wait: the [o] mark with its brackets turning around a still o.
 * The motion is CSS in globals.css (.spinner-brackets); reduced motion pulses
 * the opacity instead. Recolor it with a text class.
 */
export function Spinner({ size = 24, label = "Loading", className }: SpinnerProps) {
  const [left, right] = collapsedMark.brackets;
  return (
    <span
      role="status"
      aria-label={label}
      className={cn("inline-flex shrink-0 text-gray-300", className)}
    >
      <svg
        aria-hidden
        width={(size * collapsedMark.width) / 128}
        height={size}
        viewBox={`0 0 ${collapsedMark.width} 128`}
        fill="currentColor"
        className="overflow-visible"
      >
        <path d={collapsedMark.o} />
        <g className="spinner-brackets">
          <path d={left} />
          <path d={right} />
        </g>
      </svg>
    </span>
  );
}
