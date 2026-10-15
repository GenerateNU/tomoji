"use client";

/* eslint-disable @next/next/no-img-element -- Local SVGs retain their intrinsic Figma dimensions. */
import { useEffect, useState } from "react";
import { useConvexAuth, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { groupByDate } from "../lib/group-by-date";

const PAGE_SIZE = 20;

/** Lists the viewer's notifications and applies read changes through the existing backend. */
export function NotificationsInbox() {
  const { isAuthenticated } = useConvexAuth();
  const { results, status, loadMore } = usePaginatedQuery(
    api.notifications.list,
    isAuthenticated ? {} : "skip",
    { initialNumItems: PAGE_SIZE },
  );
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const [pending, setPending] = useState<Id<"notifications"> | "all" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Keep calendar headings accurate if the inbox stays open across midnight.
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  /** Serializes read requests and leaves displayed state to the reactive query. */
  async function updateReadState(id: Id<"notifications"> | "all") {
    if (pending !== null) return;
    setPending(id);
    setError(null);
    setNotice("");
    try {
      if (id === "all") await markAllRead({});
      else await markRead({ notificationId: id });
      // Large backlogs are marked in server-side batches, not all in this request.
      setNotice(
        id === "all"
          ? "Read updates requested. Your inbox will update shortly."
          : "Notification marked as read.",
      );
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  const loading = !isAuthenticated || status === "LoadingFirstPage";
  const allLoadedAndRead = status === "Exhausted" && results.every((item) => item.isRead);

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-10 lg:px-20 lg:py-20">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={loading || pending !== null || allLoadedAndRead}
          onClick={() => void updateReadState("all")}
        >
          {pending === "all" ? "Marking all…" : "Mark all as read"}
        </Button>
      </div>
      <p role="status" className="sr-only">
        {loading ? "Loading notifications…" : notice}
      </p>
      {error && (
        <p role="alert" className="mt-5 text-sm text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <div className="space-y-8 py-10">
          {[0, 1, 2].map((key) => (
            <div key={key} aria-hidden className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="py-16">
          <h2 className="text-lg font-semibold">You&apos;re all caught up</h2>
          <p className="mt-2 text-muted-foreground">
            Updates about your applications and work will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-9 py-9">
          {groupByDate(results, now).map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="mb-3 text-lg font-semibold">{group.label}</h2>
              <ul className="divide-y divide-border/60">
                {group.notifications.map((item) => (
                  <li key={item._id} className="flex items-start gap-3 py-5 sm:gap-5">
                    <span aria-hidden className="flex h-10 w-2 shrink-0 items-center dark:invert">
                      {!item.isRead && <img src="/notifications/unread.svg" alt="" />}
                    </span>
                    <span
                      aria-hidden
                      className="hidden h-10 w-10 shrink-0 items-center justify-center sm:flex dark:invert"
                    >
                      <img
                        src={`/notifications/${item.target.kind === "application" ? "application" : item.target.kind === "submission" ? "submission" : "assignment"}.svg`}
                        alt=""
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className={`break-words text-base leading-7 sm:text-lg ${item.isRead ? "font-medium" : "font-semibold"}`}
                      >
                        {item.title}
                      </p>
                      {item.body && (
                        <p className="mt-1 break-words text-sm leading-6 text-muted-foreground">
                          {item.body}
                        </p>
                      )}
                      <span className="mt-2 block text-xs text-muted-foreground">
                        {item.isRead ? "Read" : "Unread"}
                      </span>
                      {!item.isRead && (
                        <Button
                          variant="ghost"
                          className="mt-2 min-h-11"
                          disabled={pending !== null}
                          onClick={() => void updateReadState(item._id)}
                        >
                          {pending === item._id ? "Marking…" : "Mark as read"}
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {status !== "Exhausted" && (
            <Button
              variant="outline"
              className="min-h-11"
              disabled={status === "LoadingMore"}
              onClick={() => loadMore(PAGE_SIZE)}
            >
              {status === "LoadingMore" ? "Loading more…" : "Load more"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
