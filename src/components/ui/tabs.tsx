"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { indicatorTransition, useSlidingIndicator } from "@/hooks/use-sliding-indicator";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

// Figma "Tabs": underlined tabs on a hairline, with a 3px blue indicator that
// slides to the selected tab. For a pill-style switch, use SegmentedControl.
function Tabs({ className, orientation = "horizontal", ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-4 data-[orientation=horizontal]:flex-col", className)}
      {...props}
    />
  );
}

function TabsList({ className, children, ...props }: TabsPrimitive.List.Props) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { style, animate } = useSlidingIndicator(ref, '[role="tab"][aria-selected="true"]');

  return (
    <TabsPrimitive.List
      ref={ref}
      data-slot="tabs-list"
      className={cn(
        "group/tabs-list relative flex gap-6 w-full after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gray-100 [&>*]:z-10 group-data-[orientation=vertical]/tabs:w-auto group-data-[orientation=vertical]/tabs:flex-col group-data-[orientation=vertical]/tabs:gap-1 group-data-[orientation=vertical]/tabs:after:hidden",
        className,
      )}
      {...props}
    >
      {children}
      {style && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-0 left-0 h-0.75 bg-blue-primary group-data-[orientation=vertical]/tabs:hidden",
            animate && indicatorTransition,
          )}
          style={style}
        />
      )}
    </TabsPrimitive.List>
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "group/tabs-trigger relative flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xs px-0.5 pb-3.75 text-body font-normal whitespace-nowrap text-gray-500 hover:text-gray-950 disabled:pointer-events-none disabled:opacity-40 aria-disabled:pointer-events-none aria-disabled:opacity-40 data-active:font-medium data-active:text-gray-950 group-data-[orientation=vertical]/tabs:pb-0 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        focusRing,
        className,
      )}
      {...props}
    />
  );
}

/** A count beside a tab label, e.g. "Applications 31". Stays regular weight when the tab is active. */
function TabsCount({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="tabs-count"
      className={cn(
        "font-normal text-gray-400 group-data-active/tabs-trigger:text-gray-500",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsCount, TabsContent };
