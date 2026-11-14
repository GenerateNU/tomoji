"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// `chip` is the Figma "Filter Chip": white, blue once selected. `segment` is
// one option of a Figma "Segmented Control", a raised white card on the gray
// track once selected; use it through ToggleGroup.
const toggleVariants = cva(
  "group/toggle inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-4 focus-visible:ring-ring/25 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "gap-1.5 rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground data-pressed:bg-muted data-pressed:text-foreground [&_svg:not([class*='size-'])]:size-4",
        chip: "gap-1.5 rounded-full border border-gray-200 bg-background text-foreground hover:bg-[color-mix(in_srgb,var(--background),black_4%)] focus-visible:ring-offset-1 data-pressed:border-primary data-pressed:bg-primary data-pressed:text-primary-foreground data-pressed:hover:bg-[color-mix(in_srgb,var(--primary),black_12%)] [&_svg:not([class*='size-'])]:size-3.5",
        segment:
          "gap-1.5 rounded-sm text-gray-500 hover:bg-gray-100 hover:text-foreground data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-[0_0_4px_rgb(0_0_0/0.08)] [&_svg:not([class*='size-'])]:size-4",
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
      { variant: "chip", size: "default", className: "h-7.5 px-3 text-body-xs" },
      { variant: "chip", size: "sm", className: "h-6 px-2.5 text-body-xs" },
      { variant: "segment", size: "default", className: "h-7.5 px-3 text-body-sm" },
      { variant: "segment", size: "sm", className: "h-6 px-2.5 text-body-xs" },
      { variant: "segment", size: "icon", className: "size-7" },
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
