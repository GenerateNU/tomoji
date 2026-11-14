import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Figma "Tag": a compact, non-interactive label for status or metadata. Tone
// primary is for active or in-progress states, destructive for overdue or
// blocking ones, neutral for everything else.
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm px-2 py-1.5 font-medium whitespace-nowrap transition-colors focus-visible:ring-4 focus-visible:ring-ring/25 [&>svg]:pointer-events-none [&>svg]:shrink-0",
  {
    variants: {
      size: {
        sm: "text-body-xs [&>svg]:size-3",
        md: "text-body-sm [&>svg]:size-3.5",
      },
      tone: {
        neutral: "bg-gray-50 text-gray-700",
        primary: "bg-blue-subtle text-primary",
        destructive: "bg-red-100 text-red-700",
      },
    },
    defaultVariants: {
      size: "sm",
      tone: "neutral",
    },
  },
);

function Badge({
  className,
  size = "sm",
  tone = "neutral",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ size, tone }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      size,
      tone,
    },
  });
}

export { Badge, badgeVariants };
