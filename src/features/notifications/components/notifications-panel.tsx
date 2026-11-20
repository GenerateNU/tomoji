"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Popover } from "@base-ui/react/popover";
import { RiCloseLine, RiNotification2Line, RiMoreLine } from "@remixicon/react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { ActivityItem } from "@/components/activity-item";
import { FilterChip } from "@/components/filter-chip";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNow } from "@/hooks/use-now";
import { useStablePaginatedQuery } from "@/hooks/use-stable-paginated-query";
import { errorMessage } from "@/lib/errors";
import { iconProps } from "@/lib/icons";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { EarningsReviewModal } from "@/features/company-home/components/earnings-review-modal";
import { CompanyEarningsReminder } from "./company-earnings-reminder";
import {
  NOTIFICATION_ICONS,
  formatNotificationTime,
  formatCompanyNotificationTime,
  formatUnreadCount,
  notificationHref,
} from "../lib/notification-display";

const PAGE_SIZE = 20;

/** Figma "Notification Bell": opens the notifications panel, with a dot while anything is unread. */
export function NotificationBell({ company = false }: { company?: boolean }) {
  const { isAuthenticated } = useConvexAuth();
  const unreadCount = useQuery(api.notifications.unreadCount, isAuthenticated ? {} : "skip");
  const [open, setOpen] = useState(false);
  const [reviewEarnings, setReviewEarnings] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const hasUnread = (unreadCount ?? 0) > 0;

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          ref={trigger}
          aria-label={
            hasUnread
              ? `Notifications, ${formatUnreadCount(unreadCount ?? 0)} unread`
              : "Notifications"
          }
          className={cn(
            "relative inline-flex size-8 cursor-pointer items-center justify-center rounded text-gray-950 transition-colors hover:text-gray-700",
            focusRing,
          )}
        >
          <RiNotification2Line {...iconProps} />
          {hasUnread ? (
            <span
              aria-hidden
              className="absolute top-2 right-2 size-1.5 rounded-full border border-white bg-blue-primary"
            />
          ) : null}
        </Popover.Trigger>
        {/* Kept mounted while closed, so reopening shows the list at once instead of a skeleton. */}
        <Popover.Portal keepMounted>
          <Popover.Positioner
            side="bottom"
            align="end"
            sideOffset={company ? 4 : 8}
            collisionPadding={16}
          >
            <Popover.Popup
              className={cn(
                "flex max-h-[min(729px,var(--available-height))] w-[min(427px,calc(100vw-2rem))] flex-col gap-4 overflow-hidden rounded-lg bg-gray-0 p-6 text-gray-950 shadow-[0_0_20px_rgb(0_0_0/0.15)] outline-none",
                company &&
                  "max-h-[min(866px,var(--available-height))] gap-5 border border-gray-100 shadow-[0_10px_30px_rgb(0_0_0/0.1)]",
              )}
            >
              <NotificationsPanelContent
                unreadCount={unreadCount}
                company={company}
                onReviewEarnings={() => {
                  setOpen(false);
                  setReviewEarnings(true);
                }}
                onNavigate={() => setOpen(false)}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {company && reviewEarnings && (
        <EarningsReviewModal onClose={() => setReviewEarnings(false)} finalFocus={trigger} />
      )}
    </>
  );
}

/** The panel body: header, the Unreads filter, and the viewer's notifications newest first. */
function NotificationsPanelContent({
  unreadCount,
  company,
  onReviewEarnings,
  onNavigate,
}: {
  unreadCount: number | undefined;
  company: boolean;
  onReviewEarnings: () => void;
  /** Closes the panel when a notification opens its page. */
  onNavigate: () => void;
}) {
  const { isAuthenticated } = useConvexAuth();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const now = useNow();
  // The cursor belongs to the filter, and the query restarts when the args change.
  // Until the new filter's first page arrives, the old rows stay on screen, dimmed.
  const { results, status, loadMore, isStale } = useStablePaginatedQuery(
    api.notifications.list,
    isAuthenticated ? (unreadOnly ? { isRead: false } : {}) : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  const markRead = useMutation(api.notifications.markRead);
  const [pending, setPending] = useState<Id<"notifications"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = !isAuthenticated || (status === "LoadingFirstPage" && !isStale);

  /** Marks one notification read; the reactive list and count show the result. */
  async function open(notification: Doc<"notifications">) {
    if (notification.isRead || pending !== null) return;
    setPending(notification._id);
    setError(null);
    try {
      await markRead({ notificationId: notification._id });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  /** Supports the read action when a notification has no implemented destination. */
  function onItemKeyDown(event: KeyboardEvent, notification: Doc<"notifications">) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    void open(notification);
  }

  /**
   * Opening a notification's page marks it read without waiting: the panel
   * closes on navigation, and a failed write just leaves it unread for next time.
   */
  function navigate(notification: Doc<"notifications">) {
    if (!notification.isRead) {
      markRead({ notificationId: notification._id }).catch(() => undefined);
    }
    onNavigate();
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <Popover.Title className={cn("text-heading-sm text-gray-950", company && "leading-8")}>
          Notifications
        </Popover.Title>
        <Popover.Close
          aria-label="Close notifications"
          className={cn(
            "cursor-pointer rounded text-gray-500 transition-colors hover:text-gray-950",
            company && "-m-1 flex size-6 shrink-0 items-center justify-center",
            focusRing,
          )}
        >
          <RiCloseLine {...iconProps} />
        </Popover.Close>
      </div>
      {company && isAuthenticated && <CompanyEarningsReminder onReview={onReviewEarnings} />}
      {(!company || loading || results.length > 0 || unreadOnly) && (
        <div className="shrink-0">
          <FilterChip
            selected={unreadOnly}
            showClear={false}
            onPressedChange={setUnreadOnly}
            count={unreadCount === undefined ? undefined : formatUnreadCount(unreadCount)}
          >
            Unreads
          </FilterChip>
        </div>
      )}
      <p role="status" className="sr-only">
        {loading ? "Loading notifications…" : ""}
      </p>
      {error ? (
        <p role="alert" className="text-body-sm text-red-600">
          {error}
        </p>
      ) : null}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-24 rounded-lg" />
          ))}
        </div>
      ) : results.length === 0 ? (
        company && !unreadOnly ? (
          <div className="flex w-full shrink-0 flex-col items-center gap-1 py-4 text-center">
            <p className="text-body-lg leading-6 font-medium">Nothing new</p>
            <p className="text-body-sm leading-[19px] text-gray-500">
              Offers, submissions and payouts will show up here.
            </p>
          </div>
        ) : (
          <p className="py-6 text-center text-body-sm text-gray-500">
            {unreadOnly ? "No unread notifications." : "No notifications yet."}
          </p>
        )
      ) : (
        <div
          aria-busy={isStale}
          className={cn(
            "-mx-6 -mb-6 flex min-h-0 flex-col gap-2 overflow-y-auto px-6 pb-6 transition-opacity",
            isStale && "opacity-60",
          )}
        >
          <ul className={cn("flex flex-col gap-2", company && "gap-3")}>
            {results.map((notification) => {
              const unread = !notification.isRead;
              const href = notificationHref(notification.target, company);
              const item = (
                <ActivityItem
                  icon={NOTIFICATION_ICONS[notification.type]}
                  title={
                    company ? (
                      <span className="block pr-6">{notification.title}</span>
                    ) : (
                      notification.title
                    )
                  }
                  description={notification.body}
                  timestamp={
                    company
                      ? formatCompanyNotificationTime(notification._creationTime, now)
                      : formatNotificationTime(notification._creationTime)
                  }
                  status={
                    !unread
                      ? "read"
                      : notification.type === "submissionChangesRequested"
                        ? "warning"
                        : "unread"
                  }
                  showMenu={false}
                  {...(unread && href === null
                    ? {
                        role: "button",
                        tabIndex: 0,
                        "aria-label": `${notification.title}. Mark as read`,
                        "aria-disabled": pending !== null,
                        onClick: () => void open(notification),
                        onKeyDown: (event: KeyboardEvent) => onItemKeyDown(event, notification),
                        className: cn("cursor-pointer", focusRing),
                      }
                    : {})}
                />
              );
              return (
                <li key={notification._id} className={company ? "relative" : undefined}>
                  {href === null ? (
                    item
                  ) : (
                    <Link
                      href={href}
                      onClick={() => navigate(notification)}
                      className={cn(
                        "block rounded-lg transition-colors hover:bg-gray-50/60",
                        focusRing,
                      )}
                    >
                      {item}
                    </Link>
                  )}
                  {company && (unread || href !== null) && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Options for ${notification.title}`}
                        className={cn(
                          "absolute top-1 right-1 flex size-8 items-center justify-center rounded text-gray-500 max-md:top-0 max-md:right-0 max-md:size-11",
                          focusRing,
                        )}
                      >
                        <RiMoreLine {...iconProps} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {href !== null && (
                          <DropdownMenuItem
                            render={<Link href={href} onClick={() => navigate(notification)} />}
                          >
                            Open update
                          </DropdownMenuItem>
                        )}
                        {unread && (
                          <DropdownMenuItem
                            disabled={pending !== null}
                            onClick={() => void open(notification)}
                          >
                            Mark as read
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              );
            })}
          </ul>
          {/* A stale page's cursor belongs to the old filter, so wait for the new one. */}
          {status !== "Exhausted" && !isStale ? (
            <Button
              variant="secondary-ghost"
              className="min-h-11 self-start"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(PAGE_SIZE)}
            >
              {status === "LoadingMore" ? "Loading more…" : "Load more"}
            </Button>
          ) : null}
        </div>
      )}
    </>
  );
}
