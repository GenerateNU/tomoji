"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// `chip` is the Figma "Filter Chip". `segment` is one option of a Figma
// "Segmented Control"; use it through ToggleGroup.
const toggleVariants = cva(
  "group/toggle inline-flex shrink-0 items-center justify-center gap-1.5 font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground data-pressed:bg-muted data-pressed:text-foreground [&_svg:not([class*='size-'])]:size-4",
        chip: "rounded-full border border-input bg-background text-foreground hover:bg-muted data-pressed:border-primary data-pressed:bg-primary data-pressed:text-primary-foreground [&_svg:not([class*='size-'])]:size-3.5",
        segment:
          "rounded-md border border-transparent text-neutral-600 hover:text-foreground data-pressed:bg-primary data-pressed:text-primary-foreground [&_svg:not([class*='size-'])]:size-4",
      },
      size: {
        default: "",
        sm: "",
        icon: "",
      },
    },
    compoundVariants: [
      { variant: "default", size: "default", className: "h-9 min-w-9 px-2.5 text-body-sm" },
      { variant: "default", size: "sm", className: "h-8 min-w-8 px-2 text-body-xs" },
      { variant: "default", size: "icon", className: "size-9" },
      { variant: "chip", size: "default", className: "h-7 pr-3 pl-2.5 text-body-xs" },
      { variant: "chip", size: "sm", className: "h-6 pr-2.5 pl-2 text-body-xs" },
      { variant: "segment", size: "default", className: "h-7 px-3.5 text-body-sm" },
      { variant: "segment", size: "sm", className: "h-6 px-2.5 text-body-xs" },
      // Icon segments select to a white tile instead of a black one.
      {
        variant: "segment",
        size: "icon",
        className:
          "size-7 data-pressed:border-border data-pressed:bg-background data-pressed:text-foreground",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
