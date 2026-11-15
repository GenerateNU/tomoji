import type { ComponentProps, ReactNode } from "react";
import { RiCloseLine } from "@remixicon/react";
import { IconContainer } from "@/components/icon-container";
import { Button } from "@/components/ui/button";
import { iconProps, type IconComponent } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

type ToastProps = Omit<ComponentProps<"div">, "prefix" | "children"> & {
  prefix?: string;
  /** The affected item, in medium weight. */
  entity?: string;
  suffix?: string;
  /** Free-form message instead of prefix / entity / suffix. */
  children?: ReactNode;
  tone?: "success" | "neutral" | "error";
  /** Replaces the tone's default icon. */
  icon?: IconComponent;
  actionLabel?: string;
  onAction?: () => void;
  /** Shows the × button. The consumer unmounts the toast. */
  onClose?: () => void;
};

// Figma "Toast", drawn statically. The app's live toasts come from sonner
// (see ui/sonner.tsx), styled to match.
export function Toast({
  prefix,
  entity,
  suffix,
  children,
  tone = "success",
  icon,
  actionLabel,
  onAction,
  onClose,
  className,
  ...props
}: ToastProps) {
  return (
    <div
      role="status"
      data-slot="toast"
      className={cn(
        "inline-flex items-center gap-6 rounded-lg bg-gray-0 p-3 shadow-overlay",
        className,
      )}
      {...props}
    >
      <div className="flex min-w-0 items-center gap-3">
        <IconContainer tone={tone} icon={icon} />
        <p className="flex flex-wrap gap-x-1 text-body font-normal text-gray-700">
          {children ?? (
            <>
              {prefix ? <span>{prefix}</span> : null}
              {entity ? <span className="font-medium text-gray-950">{entity}</span> : null}
              {suffix ? <span>{suffix}</span> : null}
            </>
          )}
        </p>
      </div>
      {actionLabel || onClose ? (
        <div className="flex shrink-0 items-center gap-4">
          {actionLabel ? (
            <Button variant="secondary-subtle" size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={onClose}
              className={cn(
                "mr-1 cursor-pointer rounded-xs text-gray-500 transition-colors hover:text-gray-950",
                focusRing,
              )}
            >
              <RiCloseLine {...iconProps} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
