import type { ComponentProps, ReactNode } from "react";
import { RiMoreLine } from "@remixicon/react";
import { IconContainer } from "@/components/icon-container";
import { iconProps, type IconComponent } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";

type ActivityStatus = "unread" | "read" | "warning";

type ActivityItemProps = Omit<ComponentProps<"div">, "title"> & {
  icon: IconComponent;
  title: ReactNode;
  description?: ReactNode;
  timestamp: ReactNode;
  /** Warning is for problems that need action. */
  status?: ActivityStatus;
  /** Shows the ··· button beside the title. */
  showMenu?: boolean;
  onMenuClick?: () => void;
};

const STATUS = {
  unread: {
    surface: "bg-blue-superlight",
    tone: "success",
    dot: "bg-blue-primary",
    label: "Unread:",
  },
  read: { surface: "", tone: "neutral", dot: "", label: "" },
  warning: { surface: "bg-red-50", tone: "error", dot: "bg-red-600", label: "Needs attention:" },
} as const;

/**
 * Figma "Activity Item": a notification row. Unread rows get a blue tint and a
 * blue dot; warnings get a red tint, an error icon, and a red dot.
 */
export function ActivityItem({
  icon,
  title,
  description,
  timestamp,
  status = "unread",
  showMenu = true,
  onMenuClick,
  className,
  ...props
}: ActivityItemProps) {
  const style = STATUS[status];
  return (
    <div
      data-slot="activity-item"
      data-status={status}
      className={cn("flex items-start gap-3 rounded-lg p-3", style.surface, className)}
      {...props}
    >
      <IconContainer tone={style.tone} icon={icon} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-body font-medium text-gray-950">{title}</p>
          {showMenu ? (
            <button
              type="button"
              aria-label="More options"
              onClick={onMenuClick}
              className={cn(
                "cursor-pointer rounded text-gray-500 transition-colors hover:text-gray-950",
                focusRing,
              )}
            >
              <RiMoreLine {...iconProps} />
            </button>
          ) : null}
        </div>
        {description ? <p className="text-body font-normal text-gray-500">{description}</p> : null}
        <p className="flex items-center gap-1.5 pt-0.5 text-body-sm font-normal text-gray-500">
          {status !== "read" ? (
            <>
              <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", style.dot)} />
              <span className="sr-only">{style.label}</span>
            </>
          ) : null}
          {timestamp}
        </p>
      </div>
    </div>
  );
}
