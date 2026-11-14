import type { ComponentProps, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlertIcon, InfoIcon, ThumbsUpIcon, XIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// Figma "Banner": an inline, dismissible message on a page, in the same three
// tones as Icon Container. Pair `action` with a small ghost Button in the tone's
// color: primary-ghost, secondary-ghost, or destructive-ghost.
const bannerVariants = cva(
  "flex items-center gap-3 rounded-sm px-4 py-2 text-body-sm font-medium text-foreground [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        success: "bg-blue-subtle [&>svg]:text-primary",
        neutral: "bg-gray-50 [&>svg]:text-gray-700",
        error: "bg-red-50 [&>svg]:text-red-700",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

const ICONS = {
  success: <ThumbsUpIcon aria-hidden />,
  neutral: <InfoIcon aria-hidden />,
  error: <CircleAlertIcon aria-hidden />,
};

type BannerProps = ComponentProps<"div"> &
  VariantProps<typeof bannerVariants> & {
    /** Replaces the tone's default icon. */
    icon?: ReactNode;
    action?: ReactNode;
    /** Shows a dismiss button. */
    onDismiss?: () => void;
  };

export function Banner({
  tone = "neutral",
  icon,
  action,
  onDismiss,
  className,
  children,
  ...props
}: BannerProps) {
  const resolved = tone ?? "neutral";
  return (
    <div
      role={resolved === "error" ? "alert" : "status"}
      data-slot="banner"
      className={cn(bannerVariants({ tone }), className)}
      {...props}
    >
      {icon ?? ICONS[resolved]}
      <p className="min-w-0 flex-1">{children}</p>
      {action && <div className="-my-1.5 shrink-0">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="shrink-0 rounded-xs text-gray-500 outline-none hover:text-foreground focus-visible:ring-4 focus-visible:ring-ring/25 [&>svg]:size-4"
        >
          <XIcon />
        </button>
      )}
    </div>
  );
}
