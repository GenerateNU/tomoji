"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { RiCheckLine } from "@remixicon/react";
import { cn } from "@/lib/utils";

const boxBase =
  "inline-flex size-4 shrink-0 items-center justify-center rounded-xs border transition-colors";

// Figma "Checkbox": 16px with a 2px radius, gray outline when off, filled
// blue-primary with a white check when on and a white dash when indeterminate.
// Wrap it in a <label> to make the text clickable. With previewOnHover, an
// unchecked box shows a gray-200 check while the nearest parent with the
// `group` class is hovered (used by Selectable Card).
function Checkbox({
  className,
  previewOnHover,
  ...props
}: CheckboxPrimitive.Root.Props & { previewOnHover?: boolean }) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        boxBase,
        "peer group/checkbox relative border-gray-400 bg-gray-0 text-gray-0 outline-none after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-4 focus-visible:ring-blue-primary/25 disabled:cursor-not-allowed disabled:opacity-40 aria-invalid:border-red-600 data-checked:border-blue-primary data-checked:bg-blue-primary data-checked:hover:bg-[linear-gradient(rgba(0,0,0,0.12),rgba(0,0,0,0.12))] data-indeterminate:border-blue-primary data-indeterminate:bg-blue-primary data-indeterminate:hover:bg-[linear-gradient(rgba(0,0,0,0.12),rgba(0,0,0,0.12))]",
        previewOnHover
          ? "data-unchecked:not-data-indeterminate:group-hover:not-data-disabled:border-gray-200 data-unchecked:not-data-indeterminate:group-hover:not-data-disabled:bg-gray-200"
          : "not-data-disabled:data-unchecked:not-data-indeterminate:hover:border-gray-500 in-[label:hover]:not-data-disabled:data-unchecked:not-data-indeterminate:border-gray-500",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        keepMounted={previewOnHover}
        className={cn(
          "grid place-content-center transition-none",
          previewOnHover &&
            "data-unchecked:not-data-indeterminate:invisible data-unchecked:not-data-indeterminate:group-hover:visible",
        )}
      >
        <RiCheckLine size={12} aria-hidden className="group-data-indeterminate/checkbox:hidden" />
        <span className="hidden h-0.5 w-2 rounded-full bg-gray-0 group-data-indeterminate/checkbox:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

// The box alone, for rows that already handle the click (menu items,
// selectable cards). Hover styles follow the nearest parent with `group`.
function CheckboxIndicator({
  checked = false,
  indeterminate = false,
  disabled,
  interactive = true,
  previewOnHover,
  className,
}: {
  checked?: boolean | "indeterminate";
  indeterminate?: boolean;
  disabled?: boolean;
  interactive?: boolean;
  previewOnHover?: boolean;
  className?: string;
}) {
  const isIndeterminate = indeterminate || checked === "indeterminate";
  const on = checked === true || isIndeterminate;

  return (
    <span
      aria-hidden
      data-slot="checkbox-indicator-box"
      className={cn(
        boxBase,
        on
          ? "border-blue-primary bg-blue-primary text-gray-0"
          : "border-gray-400 bg-gray-0 text-gray-0",
        interactive &&
          (on
            ? "group-hover:bg-[linear-gradient(rgba(0,0,0,0.12),rgba(0,0,0,0.12))]"
            : previewOnHover
              ? "group-hover:border-gray-200 group-hover:bg-gray-200"
              : "group-hover:border-gray-500"),
        disabled && "opacity-40",
        className,
      )}
    >
      {isIndeterminate ? (
        <span className="h-0.5 w-2 rounded-full bg-gray-0" />
      ) : (
        <RiCheckLine
          size={12}
          className={cn(
            !on && (previewOnHover && interactive ? "invisible group-hover:visible" : "invisible"),
          )}
        />
      )}
    </span>
  );
}

export { Checkbox, CheckboxIndicator };
