"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Figma "Switch" is the default size: a 48×28 track with a 24px thumb.
const switchVariants = cva(
  "peer group/switch relative inline-flex shrink-0 items-center rounded-full p-0.5 transition-colors outline-none group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-checked:bg-primary data-unchecked:bg-input data-disabled:cursor-not-allowed data-disabled:opacity-50",
  {
    variants: {
      size: {
        default: "h-7 w-12",
        sm: "h-5 w-9",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

function Switch({
  className,
  size = "default",
  ...props
}: SwitchPrimitive.Root.Props & VariantProps<typeof switchVariants>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      className={cn(switchVariants({ size }), className)}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block rounded-full bg-background shadow-[0_0_20px_-5px_rgb(0_0_0/0.15)] transition-transform group-data-[size=default]/switch:size-6 group-data-[size=sm]/switch:size-4 data-unchecked:translate-x-0 group-data-[size=default]/switch:data-checked:translate-x-5 group-data-[size=sm]/switch:data-checked:translate-x-4"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
