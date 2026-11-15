import type { ComponentProps } from "react";
import { RiCheckLine, RiErrorWarningLine, RiInformationLine } from "@remixicon/react";
import { cva, type VariantProps } from "class-variance-authority";
import { iconProps, type IconComponent } from "@/lib/icons";
import { cn } from "@/lib/utils";

// Figma "Icon Container": a tinted 28px square around a 16px status icon, for
// toasts, banners, list rows and empty states.
const iconContainerVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded p-1.5 [&_svg]:shrink-0",
  {
    variants: {
      tone: {
        success: "bg-blue-subtle text-blue-primary",
        neutral: "bg-gray-50 text-gray-700",
        error: "bg-red-100 text-red-700",
      },
    },
    defaultVariants: {
      tone: "success",
    },
  },
);

const DEFAULT_ICONS = {
  success: RiCheckLine,
  neutral: RiInformationLine,
  error: RiErrorWarningLine,
} satisfies Record<"success" | "neutral" | "error", IconComponent>;

/** Decorative: pair it with text that says the same thing. */
export function IconContainer({
  tone = "success",
  icon,
  className,
  children,
  ...props
}: Omit<ComponentProps<"span">, "children"> &
  VariantProps<typeof iconContainerVariants> & {
    /** Replaces the tone's default icon. */
    icon?: IconComponent;
    /** Custom content instead of an icon, such as an SVG. */
    children?: React.ReactNode;
  }) {
  const Icon = icon ?? DEFAULT_ICONS[tone ?? "success"];
  return (
    <span
      aria-hidden
      data-slot="icon-container"
      className={cn(iconContainerVariants({ tone }), className)}
      {...props}
    >
      {children ?? <Icon {...iconProps} />}
    </span>
  );
}

export { iconContainerVariants };
