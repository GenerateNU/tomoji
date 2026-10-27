import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ActivityItemProps = Omit<ComponentProps<"article">, "title"> & {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  timestamp: ReactNode;
  unread?: boolean;
  /** Shown beside the title, usually an overflow (···) menu. */
  actions?: ReactNode;
};

/** Figma "Activity Item": a notification row. Unread rows get a light fill and a dot. */
export function ActivityItem({
  icon,
  title,
  description,
  timestamp,
  unread = false,
  actions,
  className,
  ...props
}: ActivityItemProps) {
  return (
    <article
      data-unread={unread || undefined}
      className={cn("flex items-start gap-3 rounded-lg p-3 data-unread:bg-neutral-50", className)}
      {...props}
    >
      <span
        aria-hidden
        className="flex shrink-0 items-center rounded-sm bg-muted p-3 [&_svg]:size-4"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-2.5">
          <p className="min-w-0 flex-1 text-body font-medium">{title}</p>
          {/* Negative margin keeps a full-size button from pushing the rows apart. */}
          {actions && <div className="-m-2 shrink-0">{actions}</div>}
        </div>
        {description && <p className="text-body text-muted-foreground">{description}</p>}
        <p className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
          {unread && (
            <>
              <span aria-hidden className="size-1 shrink-0 rounded-full bg-foreground" />
              <span className="sr-only">Unread.</span>
            </>
          )}
          {timestamp}
        </p>
      </div>
    </article>
  );
}
