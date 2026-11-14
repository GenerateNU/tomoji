import { useSyncExternalStore } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import type { Doc, Id } from "@convex/_generated/dataModel";

const dates = [
  "2026-10-15T12:00:00-04:00",
  "2026-10-14T12:00:00-04:00",
  "2026-10-14T10:00:00-04:00",
  "2026-10-09T12:00:00-04:00",
];
const titles = [
  "You have an offer for Owala Pastels",
  "Your Jamba Juice video was approved",
  "Changes requested for your Yeti video",
  "Your Hydroflask assignment was cancelled",
];
const types = [
  "applicationOffered",
  "submissionApproved",
  "submissionChangesRequested",
  "assignmentCancelled",
] as const;
let notifications: Doc<"notifications">[] = titles.map((title, i) => ({
  _id: `notification-${i}` as Id<"notifications">,
  _creationTime: Date.parse(dates[i]),
  userId: "viewer" as Id<"users">,
  title,
  body: "Review the update and coordinate your next steps with the company.",
  type: types[i],
  isRead: i === 3,
  target:
    i === 0
      ? {
          kind: "application",
          applicationId: "application" as Id<"applications">,
          opportunityId: "opportunity" as Id<"opportunities">,
        }
      : i === 3
        ? {
            kind: "assignment",
            assignmentId: "assignment" as Id<"assignments">,
          }
        : {
            kind: "submission",
            submissionId: "submission" as Id<"submissions">,
            assignmentId: "assignment" as Id<"assignments">,
          },
}));
// The panel also covers a target with no page yet; the inbox specs count four rows.
if (new URLSearchParams(location.search).get("view") === "panel")
  notifications.push({
    _id: "notification-4" as Id<"notifications">,
    _creationTime: Date.parse("2026-10-08T12:00:00-04:00"),
    userId: "viewer" as Id<"users">,
    title: "A dispute was opened on your Yeti video",
    type: "disputeOpened",
    isRead: false,
    target: { kind: "dispute", disputeId: "dispute" as Id<"disputes"> },
  });
let version = 0;
let limit = 2;
const listeners = new Set<() => void>();
const update = () => {
  version++;
  listeners.forEach((listener) => listener());
};
export const fixture = {
  mode: new URLSearchParams(location.search).get("scenario") ?? "ready",
  calls: [] as { name: string; args: Record<string, unknown> }[],
  navigations: [] as string[],
  fail: false,
  release: null as (() => void) | null,
  hold: false,
  /** Holds the unread filter's first page, so the spec can see the panel mid-load. */
  holdUnread: false,
  releaseUnread() {
    this.holdUnread = false;
    update();
  },
  ready() {
    this.mode = "ready";
    update();
  },
};

/** A local reactive service double: no auth bypass, deployment, or live writes. */
export function useConvexAuth() {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => version,
  );
  // `auth` is authentication in progress, not signed out. The real hook
  // reports that as isLoading, and useMe relies on the difference.
  return {
    isAuthenticated: fixture.mode !== "auth",
    isLoading: fixture.mode === "auth",
  };
}

// Like Convex, return the same results array until the data or arguments change.
const cache = new Map<string, Doc<"notifications">[]>();
function memoized(key: string, compute: () => Doc<"notifications">[]) {
  if (!cache.has(key)) cache.set(key, compute());
  return cache.get(key)!;
}

/** Serves the bell's unread count from the same records as the list. */
export function useQuery(reference: FunctionReference<"query">, args: unknown) {
  if (getFunctionName(reference) !== "notifications:unreadCount")
    throw new Error("Unexpected query");
  if (args === "skip") return undefined;
  return fixture.mode === "empty" ? 0 : notifications.filter((item) => !item.isRead).length;
}

/** Exercises the real inbox's query selection, read filter, and load-more callback. */
export function usePaginatedQuery(reference: FunctionReference<"query">, args: unknown) {
  if (getFunctionName(reference) !== "notifications:list") throw new Error("Unexpected query");
  if (fixture.mode === "query-error") throw new Error("Fixture query failure");
  const isRead =
    typeof args === "object" && args !== null ? (args as { isRead?: boolean }).isRead : undefined;
  const loading =
    args === "skip" || fixture.mode === "loading" || (isRead === false && fixture.holdUnread);
  const matching = notifications.filter((item) => isRead === undefined || item.isRead === isRead);
  const results = memoized(`${version}|${fixture.mode}|${isRead}|${limit}|${loading}`, () =>
    fixture.mode === "empty" || loading ? [] : matching.slice(0, limit),
  );
  return {
    results,
    status: loading
      ? "LoadingFirstPage"
      : results.length < matching.length && fixture.mode !== "empty"
        ? "CanLoadMore"
        : "Exhausted",
    loadMore(numItems: number) {
      limit += numItems;
      update();
    },
  };
}

/** Records the exact API call, then publishes successful read-state updates. */
export function useMutation(reference: FunctionReference<"mutation">) {
  return async (args: Record<string, unknown>) => {
    const name = getFunctionName(reference);
    fixture.calls.push({ name, args });
    if (fixture.hold)
      await new Promise<void>((resolve) => {
        fixture.release = resolve;
      });
    if (fixture.fail) {
      fixture.fail = false;
      throw new Error("Do not expose this secret");
    }
    if (name !== "notifications:markRead" && name !== "notifications:markAllRead")
      throw new Error("Unexpected mutation");
    notifications = notifications.map((item) =>
      name === "notifications:markAllRead" || item._id === args.notificationId
        ? { ...item, isRead: true }
        : item,
    );
    update();
  };
}
