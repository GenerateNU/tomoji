"use client";

// Figma "Menu": overflow (···) menus, single-choice lists and multi-select
// lists. A white panel of 16px items; popups have no open/close animation.

import * as React from "react";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { RiArrowRightSLine, RiCheckLine } from "@remixicon/react";
import { iconProps, type IconComponent } from "@/lib/icons";
import { cn } from "@/lib/utils";

const itemBase =
  "relative flex w-full cursor-pointer items-center gap-2 rounded-sm p-2 text-left text-body font-normal transition-colors outline-none select-none data-disabled:cursor-not-allowed data-disabled:opacity-40";

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}: MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        className="isolate z-50 outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "z-50 flex max-h-(--available-height) min-w-50 flex-col gap-0.5 origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border border-gray-100 bg-background p-1.5 text-gray-950 shadow-overlay outline-none",
            className,
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

function DropdownMenuGroup({ ...props }: MenuPrimitive.Group.Props) {
  return <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />;
}

const sectionLabelClass = "px-2 pt-2 pb-1 text-body-xs font-medium text-gray-500 uppercase";

// Names a DropdownMenuGroup.
function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(sectionLabelClass, "data-inset:pl-8", className)}
      {...props}
    />
  );
}

// An uppercase heading for items that aren't in a DropdownMenuGroup.
function DropdownMenuSectionLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="presentation"
      data-slot="dropdown-menu-section-label"
      className={cn(sectionLabelClass, className)}
      {...props}
    />
  );
}

// A divider, then a row for a count and Clear / Done buttons.
function DropdownMenuFooter({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div role="presentation" data-slot="dropdown-menu-footer" {...props}>
      <div className="px-2 py-1">
        <div className="h-px bg-gray-100" />
      </div>
      <div className={cn("flex items-center gap-2 px-2 py-1.5", className)}>{children}</div>
    </div>
  );
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  icon: Icon,
  chevron,
  children,
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean;
  variant?: "default" | "destructive";
  icon?: IconComponent;
  chevron?: boolean;
}) {
  const decorated = Icon || chevron;
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        itemBase,
        "text-gray-950 data-highlighted:bg-gray-50 data-inset:pl-8 data-[variant=destructive]:text-red-700 data-[variant=destructive]:data-highlighted:bg-red-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {decorated ? (
        <>
          {Icon ? <Icon {...iconProps} /> : null}
          <span className="min-w-0 flex-1 truncate">{children}</span>
          {chevron ? <RiArrowRightSLine {...iconProps} className="text-gray-500" /> : null}
        </>
      ) : (
        children
      )}
    </MenuPrimitive.Item>
  );
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        itemBase,
        "text-gray-950 data-highlighted:bg-gray-50 data-inset:pl-8 data-popup-open:bg-gray-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <RiArrowRightSLine {...iconProps} className="ml-auto text-gray-500" />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      data-slot="dropdown-menu-sub-content"
      className={cn("w-auto min-w-50", className)}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  );
}

// Multi-select row: a leading checkbox. Choosing it keeps the menu open.
function DropdownMenuCheckboxItem({
  className,
  children,
  inset,
  closeOnClick = false,
  ...props
}: MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      closeOnClick={closeOnClick}
      className={cn(
        itemBase,
        "group/menu-checkbox text-gray-950 data-highlighted:bg-gray-50 data-inset:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        data-slot="dropdown-menu-checkbox-item-indicator"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-xs border border-gray-400 bg-gray-0 text-gray-0 transition-colors group-data-checked/menu-checkbox:border-blue-primary group-data-checked/menu-checkbox:bg-blue-primary"
      >
        <RiCheckLine size={12} className="invisible group-data-checked/menu-checkbox:visible" />
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </MenuPrimitive.CheckboxItem>
  );
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

// Single-choice row: a blue check trails the chosen option.
function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: MenuPrimitive.RadioItem.Props & {
  inset?: boolean;
}) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        itemBase,
        "text-gray-950 data-highlighted:bg-gray-50 data-inset:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className,
      )}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <MenuPrimitive.RadioItemIndicator
        data-slot="dropdown-menu-radio-item-indicator"
        className="flex shrink-0 items-center"
      >
        <RiCheckLine {...iconProps} className="text-blue-primary" />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("mx-2 my-1 h-px bg-gray-100", className)}
      {...props}
    />
  );
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn("ml-auto text-body-xs tracking-widest text-gray-500", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSectionLabel,
  DropdownMenuFooter,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
};
