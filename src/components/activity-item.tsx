import type { ComponentProps, ReactNode } from "react";
import { IconContainer } from "@/components/icon-container";
import { cn } from "@/lib/utils";

type ActivityStatus = "unread" | "read" | "warning";

type ActivityItemProps = Omit<ComponentProps<"article">, "title"> & {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  timestamp: ReactNode;
  /** Warning is for problems that need action. */
  status?: ActivityStatus;
  /** Shown beside the title, usually an overflow (···) menu. */
  actions?: ReactNode;
};

const ICON_TONE = { unread: "success", read: "neutral", warning: "error" } as const;

/**
 * Figma "Activity Item": a notification row. Unread rows get a blue tint and a
 * blue dot; warnings get a red tint, an error icon, and a red dot.
 */
export function ActivityItem({
  icon,
  title,
  description,
  timestamp,
  status = "read",
  actions,
  className,
  ...props
}: ActivityItemProps) {
  return (
    <article
      data-status={status}
      className={cn(
        "flex items-start gap-3 rounded-lg p-3 data-[status=unread]:bg-blue-superlight data-[status=warning]:bg-red-50",
        className,
      )}
      {...props}
    >
      <IconContainer tone={ICON_TONE[status]}>{icon}</IconContainer>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 text-body font-medium">{title}</p>
          {/* Negative margin keeps a full-size button from pushing the rows apart. */}
          {actions && <div className="-m-2 shrink-0 text-gray-500">{actions}</div>}
        </div>
        {description && <p className="text-body text-muted-foreground">{description}</p>}
        <p className="flex items-center gap-1.5 pt-0.5 text-body-sm text-muted-foreground">
          {status !== "read" && (
            <>
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  status === "warning" ? "bg-red-600" : "bg-primary",
                )}
              />
              <span className="sr-only">
                {status === "warning" ? "Needs attention." : "Unread."}
              </span>
            </>
          )}
          {timestamp}
        </p>
      </div>
    </article>
  );
}
