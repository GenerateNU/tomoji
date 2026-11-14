import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Figma "Icon Container": a tinted 28px square around a 16px status icon, for
// toasts, banners, list rows and empty states.
const iconContainerVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-sm p-1.5 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        success: "bg-blue-subtle text-primary",
        neutral: "bg-gray-50 text-gray-700",
        error: "bg-red-100 text-red-700",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

/** Decorative: pair it with text that says the same thing. */
export function IconContainer({
  tone,
  className,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof iconContainerVariants>) {
  return (
    <span
      aria-hidden
      data-slot="icon-container"
      className={cn(iconContainerVariants({ tone }), className)}
      {...props}
    />
  );
}

export { iconContainerVariants };
