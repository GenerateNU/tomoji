"use client";

import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Figma "Switch" is the default size: a 48×28 track with a 24px thumb, gray
// when off and blue when on. Hover darkens the track; the thumb slides 20px
// over 150ms.
const switchVariants = cva(
  "peer group/switch relative inline-flex shrink-0 items-center rounded-full p-0.5 cursor-pointer transition-colors outline-none group-has-[:focus-visible]/field-label:ring-0 after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:ring-4 focus-visible:ring-blue-primary/25 aria-invalid:ring-4 aria-invalid:ring-destructive/20 data-checked:bg-primary data-checked:not-data-disabled:hover:bg-[linear-gradient(rgba(0,0,0,0.12),rgba(0,0,0,0.12))] data-unchecked:bg-gray-300 data-unchecked:not-data-disabled:hover:bg-gray-400 data-disabled:cursor-not-allowed data-disabled:opacity-40 motion-reduce:transition-none",
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
        className="pointer-events-none block rounded-full bg-background shadow-thumb transition-transform duration-150 ease-out motion-reduce:transition-none group-data-[size=default]/switch:size-6 group-data-[size=sm]/switch:size-4 data-unchecked:translate-x-0 group-data-[size=default]/switch:data-checked:translate-x-5 group-data-[size=sm]/switch:data-checked:translate-x-4"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
