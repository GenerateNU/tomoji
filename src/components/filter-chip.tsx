"use client";

import type { ReactNode } from "react";
import { Toggle } from "@base-ui/react/toggle";
import { RiCloseLine } from "@remixicon/react";
import type { IconComponent } from "@/lib/icons";
import { focusRing, overlayOnBlue12, overlayOnLightSoft } from "@/lib/styles";
import { cn } from "@/lib/utils";

type FilterChipProps = Omit<Toggle.Props, "pressed" | "defaultPressed" | "onPressedChange"> & {
  /** Filled blue; sets aria-pressed. */
  selected?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  /** Leading 14px icon. A selected chip shows a close icon instead. */
  icon?: IconComponent;
  /** Whether a selected chip swaps its icon for ×. Off for chips that read as a tab. */
  showClear?: boolean;
  /** Muted count after the label. */
  count?: number | string;
  children: ReactNode;
};

// Figma "Filter Chip": a pill-shaped toggle. A selected chip swaps its icon for
// × to show it can be cleared.
export function FilterChip({
  selected = false,
  onPressedChange,
  icon,
  showClear = true,
  count,
  className,
  children,
  ...props
}: FilterChipProps) {
  const Icon = selected && showClear ? RiCloseLine : icon;
  return (
    <Toggle
      data-slot="filter-chip"
      pressed={selected}
      onPressedChange={(pressed) => onPressedChange?.(pressed)}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-body-xs font-medium whitespace-nowrap transition-[background-image] disabled:cursor-not-allowed disabled:opacity-40",
        focusRing,
        selected
          ? cn("border-blue-primary bg-blue-primary text-gray-0", overlayOnBlue12)
          : cn(
              "border-gray-200 bg-gray-0 text-gray-950 focus-visible:border-gray-300 disabled:border-gray-300",
              overlayOnLightSoft,
            ),
        className,
      )}
      {...props}
    >
      {Icon ? <Icon size={14} aria-hidden /> : null}
      {children}
      {count !== undefined ? (
        <span
          className={cn(
            "text-body-xs font-normal tabular-nums",
            selected ? "text-blue-subtle" : "text-gray-400",
          )}
        >
          {count}
        </span>
      ) : null}
    </Toggle>
  );
}
