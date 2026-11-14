import type { ComponentProps, ReactNode } from "react";
import {
  RiCloseLine,
  RiErrorWarningLine,
  RiInformationLine,
  RiThumbUpLine,
} from "@remixicon/react";
import { Button } from "@/components/ui/button";
import { iconProps, type IconComponent } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

type BannerTone = "success" | "neutral" | "error";

// Figma "Banner": an inline, dismissible message on a page, in the same three
// tones as Icon Container. The action is a small ghost Button in the tone's color.
const TONES = {
  success: {
    box: "bg-blue-subtle",
    icon: "text-blue-primary",
    action: "primary-ghost",
    defaultIcon: RiThumbUpLine,
  },
  neutral: {
    box: "bg-gray-50",
    icon: "text-gray-700",
    action: "secondary-ghost",
    defaultIcon: RiInformationLine,
  },
  error: {
    box: "bg-red-50",
    icon: "text-red-700",
    action: "destructive-ghost",
    defaultIcon: RiErrorWarningLine,
  },
} as const;

type BannerProps = Omit<ComponentProps<"div">, "children"> & {
  tone?: BannerTone;
  children: ReactNode;
  /** Replaces the tone's default icon. */
  icon?: IconComponent;
  /** Label for the small ghost action Button. */
  actionLabel?: string;
  onAction?: () => void;
  /** Shows a dismiss button. The consumer unmounts the banner. */
  onClose?: () => void;
};

export function Banner({
  tone = "success",
  icon,
  actionLabel,
  onAction,
  onClose,
  className,
  children,
  ...props
}: BannerProps) {
  const style = TONES[tone];
  const Icon = icon ?? style.defaultIcon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      data-slot="banner"
      className={cn("flex w-full items-center gap-3 rounded px-4 py-2", style.box, className)}
      {...props}
    >
      <Icon {...iconProps} className={cn("shrink-0", style.icon)} />
      <p className="min-w-0 flex-1 text-body-sm font-medium text-gray-950">{children}</p>
      {actionLabel ? (
        <Button variant={style.action} size="sm" className="shrink-0" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
      {onClose ? (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onClose}
          className={cn(
            "shrink-0 cursor-pointer rounded-xs text-gray-500 transition-colors hover:text-gray-950",
            focusRing,
          )}
        >
          <RiCloseLine {...iconProps} />
        </button>
      ) : null}
    </div>
  );
}
