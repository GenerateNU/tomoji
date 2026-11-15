"use client";

// Figma "Select" (Multi Filled) and "Select Menu": a searchable select whose
// choices show as removable tags.

import * as React from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react";
import { RiArrowDownSLine, RiCheckLine, RiCloseLine } from "@remixicon/react";
import { iconProps } from "@/lib/icons";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

const Combobox = ComboboxPrimitive.Root;

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />;
}

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      className={cn("[&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    >
      {children}
      <RiArrowDownSLine {...iconProps} className="pointer-events-none text-gray-500" />
    </ComboboxPrimitive.Trigger>
  );
}

function ComboboxClear({ className, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      render={<InputGroupButton variant="secondary-ghost" size="icon-xs" />}
      className={cn(className)}
      {...props}
    >
      <RiCloseLine {...iconProps} className="pointer-events-none" />
    </ComboboxPrimitive.Clear>
  );
}

function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}: ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean;
  showClear?: boolean;
}) {
  return (
    <InputGroup className={cn("w-auto", className)}>
      <ComboboxPrimitive.Input render={<InputGroupInput disabled={disabled} />} {...props} />
      <InputGroupAddon align="inline-end">
        {showTrigger && (
          <InputGroupButton
            size="icon-xs"
            variant="secondary-ghost"
            render={<ComboboxTrigger />}
            data-slot="input-group-button"
            className="group-has-data-[slot=combobox-clear]/input-group:hidden data-pressed:bg-transparent"
            disabled={disabled}
          />
        )}
        {showClear && <ComboboxClear disabled={disabled} />}
      </InputGroupAddon>
      {children}
    </InputGroup>
  );
}

function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}: ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "anchor"
  >) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          data-chips={!!anchor}
          className={cn(
            "group/combobox-content relative max-h-(--available-height) w-(--anchor-width) max-w-(--available-width) min-w-60 origin-(--transform-origin) overflow-hidden rounded-lg border border-gray-100 bg-background text-gray-950 shadow-overlay data-[chips=true]:min-w-(--anchor-width) *:data-[slot=input-group]:m-1.5 *:data-[slot=input-group]:mb-0 *:data-[slot=input-group]:h-9 *:data-[slot=input-group]:w-auto *:data-[slot=input-group]:border-0 *:data-[slot=input-group]:border-b *:data-[slot=input-group]:rounded-none *:data-[slot=input-group]:shadow-none",
            className,
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn(
        "no-scrollbar flex flex-col gap-0.5 max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] scroll-py-1.5 overflow-y-auto overscroll-contain p-1.5 data-empty:p-0",
        className,
      )}
      {...props}
    />
  );
}

// "check" marks the chosen option on the right; "checkbox" shows a checkbox on
// the left, as Figma's multi-select menu does.
function ComboboxItem({
  className,
  children,
  indicator = "check",
  ...props
}: ComboboxPrimitive.Item.Props & { indicator?: "check" | "checkbox" }) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      data-indicator={indicator}
      className={cn(
        "data-[indicator=checkbox]:pr-2",
        "group/combobox-item relative flex w-full cursor-pointer items-center gap-2 rounded-sm p-2 pr-8 text-body font-normal text-gray-950 transition-colors outline-none select-none data-highlighted:bg-gray-50 data-disabled:cursor-not-allowed data-disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {indicator === "checkbox" && (
        <span
          aria-hidden
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-xs border border-gray-400 bg-gray-0 text-gray-0 transition-colors group-data-selected/combobox-item:border-blue-primary group-data-selected/combobox-item:bg-blue-primary"
        >
          <RiCheckLine size={12} className="invisible group-data-selected/combobox-item:visible" />
        </span>
      )}
      {children}
      {indicator === "check" && (
        <ComboboxPrimitive.ItemIndicator
          render={
            <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center" />
          }
        >
          <RiCheckLine {...iconProps} className="pointer-events-none text-blue-primary" />
        </ComboboxPrimitive.ItemIndicator>
      )}
    </ComboboxPrimitive.Item>
  );
}

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group data-slot="combobox-group" className={cn(className)} {...props} />
  );
}

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-label"
      className={cn("px-2 pt-2 pb-1 text-body-xs font-medium text-gray-500 uppercase", className)}
      {...props}
    />
  );
}

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />;
}

function ComboboxEmpty({ className, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn(
        "hidden w-full justify-center py-2 text-center text-body-sm text-gray-400 group-data-empty/combobox-content:flex",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn("mx-2 my-1 h-px bg-gray-100", className)}
      {...props}
    />
  );
}

function ComboboxChips({
  className,
  ...props
}: React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> & ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn(
        "flex min-h-11.75 flex-wrap items-center gap-1.5 rounded border border-gray-300 bg-gray-0 px-3 py-2 text-body transition-shadow focus-within:border-blue-primary focus-within:inset-ring focus-within:inset-ring-blue-primary focus-within:ring-4 focus-within:ring-blue-primary/25 has-aria-invalid:border-red-600 has-aria-invalid:bg-red-50 has-aria-invalid:inset-ring has-aria-invalid:inset-ring-red-600",
        className,
      )}
      {...props}
    />
  );
}

function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}: ComboboxPrimitive.Chip.Props & {
  showRemove?: boolean;
}) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        "flex w-fit items-center justify-center gap-1 rounded-sm bg-gray-50 px-2 py-1.5 text-body-sm font-medium whitespace-nowrap text-gray-700 has-disabled:pointer-events-none has-disabled:cursor-not-allowed has-disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          aria-label="Remove"
          className="-m-0.5 cursor-pointer rounded-full p-0.5 transition-opacity outline-none hover:opacity-70 focus-visible:ring-2 focus-visible:ring-blue-primary/25"
          data-slot="combobox-chip-remove"
        >
          <RiCloseLine {...iconProps} size={14} className="pointer-events-none" />
        </ComboboxPrimitive.ChipRemove>
      )}
    </ComboboxPrimitive.Chip>
  );
}

function ComboboxChipsInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-chip-input"
      className={cn(
        "min-w-16 flex-1 bg-transparent outline-none placeholder:text-gray-400",
        className,
      )}
      {...props}
    />
  );
}

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null);
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
};
