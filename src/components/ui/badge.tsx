import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { RiCloseLine } from "@remixicon/react";
import { iconProps, type IconComponent } from "@/lib/icons";
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
  icon: Icon,
  onRemove,
  removeLabel,
  ...props
}: useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & {
    icon?: IconComponent;
    onRemove?: () => void;
    removeLabel?: string;
  }) {
  const label =
    removeLabel ?? `Remove ${typeof props.children === "string" ? props.children : "tag"}`;
  const iconSize = size === "md" ? 14 : 12;
  const withExtras =
    Icon || onRemove
      ? {
          children: (
            <>
              {Icon ? <Icon {...iconProps} size={iconSize} /> : null}
              {props.children}
              {onRemove ? (
                <button
                  type="button"
                  aria-label={label}
                  onClick={(event) => {
                    // Stops the click opening a parent Select.
                    event.stopPropagation();
                    onRemove();
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  className="-m-0.5 cursor-pointer rounded-full p-0.5 transition-opacity outline-none hover:opacity-70 focus-visible:ring-2 focus-visible:ring-blue-primary/25"
                >
                  <RiCloseLine {...iconProps} size={iconSize} />
                </button>
              ) : null}
            </>
          ),
        }
      : null;
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ size, tone }), className),
      },
      props,
      withExtras ?? {},
    ),
    render,
    state: {
      slot: "badge",
      size,
      tone,
    },
  });
}

export { Badge, Badge as Tag, badgeVariants };
