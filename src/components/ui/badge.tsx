import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Figma "Tag": a small grey pill for statuses and metadata.
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full bg-muted whitespace-nowrap text-neutral-600 transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 [&>svg]:pointer-events-none [&>svg]:shrink-0",
  {
    variants: {
      size: {
        sm: "px-2 py-0.5 text-body-xs [&>svg]:size-3",
        md: "px-2.5 py-1 text-body-sm [&>svg]:size-3.5",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  },
);

function Badge({
  className,
  size = "sm",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ size }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      size,
    },
  });
}

export { Badge, badgeVariants };
