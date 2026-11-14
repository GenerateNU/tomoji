import { useState, useSyncExternalStore } from "react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";

const campaigns: Doc<"campaigns">[] = ["draft", "open", "paused", "closed", "open"].map(
  (status, i) => ({
    _id: `campaign-${i}` as Id<"campaigns">,
    _creationTime: 1790000000000 - i,
    companyId: "company" as Id<"companies">,
    createdBy: "member" as Id<"companyUsers">,
    title: [
      "Developer tools launch",
      "Owala Pastels",
      "Agent tutorials",
      "Summer launch",
      "Winter launch",
    ][i],
    description: "Show how the product helps your daily workflow.",
    status: status as Doc<"campaigns">["status"],
    budgetCents: 125050,
    startsAt: Date.parse("2026-10-15T14:00:00Z"),
    endsAt: i === 0 ? undefined : Date.parse("2026-11-15T14:00:00Z"),
  }),
);
let version = 0;
const listeners = new Set<() => void>();
const update = () => {
  version++;
  listeners.forEach((listener) => listener());
};
export const fixture = {
  mode: new URLSearchParams(location.search).get("scenario") ?? "company",
  queries: [] as { name: string; args: unknown }[],
  writes: [] as Record<string, unknown>[],
  fail: false,
  hold: false,
  release: null as (() => void) | null,
  ready() {
    this.mode = "company";
    update();
  },
};

/** Publishes local service changes without connecting to a deployment. */
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
  return { isAuthenticated: fixture.mode !== "auth", isLoading: fixture.mode === "auth" };
}

/** Uses the real public identity shape, including the unsynced window. */
export function useQuery(
  reference: FunctionReference<"query">,
  args: unknown,
): FunctionReturnType<typeof api.users.me> | undefined {
  if (getFunctionName(reference) !== "users:me") throw new Error("Unexpected query");
  if (args === "skip" || fixture.mode === "loading") return undefined;
  if (fixture.mode === "unsynced") return { synced: false };
  const base = {
    synced: true as const,
    userId: "viewer" as Id<"users">,
    email: "company@example.com",
    firstName: "Dana",
    lastName: "Okafor",
    profilePictureMediaId: undefined,
  };
  return fixture.mode === "creator"
    ? { ...base, role: "creator" }
    : {
        ...base,
        role: "company",
        orgId: "org",
        companyRole: fixture.mode === "member" ? "member" : "admin",
      };
}

/** Records local create calls and simulates a deferred response or structured failure. */
export function useMutation(reference: FunctionReference<"mutation">) {
  if (getFunctionName(reference) !== "campaigns:create") throw new Error("Unexpected mutation");
  return async (args: Record<string, unknown>) => {
    fixture.writes.push(args);
    if (fixture.hold)
      await new Promise<void>((resolve) => {
        fixture.release = resolve;
      });
    if (fixture.fail) {
      fixture.fail = false;
      throw new ConvexError({ code: "upstream_failure" });
    }
    return "new-campaign" as Id<"campaigns">;
  };
}

/** Simulates cursor reset on filter changes and records which query is actually requested. */
export function usePaginatedQuery(
  reference: FunctionReference<"query">,
  args: "skip" | { status?: string },
) {
  const key = JSON.stringify(args);
  const [page, setPage] = useState({ key, limit: 2 });
  if (page.key !== key) setPage({ key, limit: 2 });
  const name = getFunctionName(reference);
  if (name !== "campaigns:list") throw new Error("Unexpected paginated query");
  if (args !== "skip" && !fixture.queries.some((query) => JSON.stringify(query.args) === key))
    fixture.queries.push({ name, args });
  if (args !== "skip" && fixture.mode === "query-error") throw new Error("Private query detail");
  const all =
    args === "skip" || fixture.mode === "empty"
      ? []
      : campaigns.filter((item) => !args.status || item.status === args.status);
  const limit = page.key === key ? page.limit : 2;
  return {
    results: all.slice(0, limit),
    status: args === "skip" ? "LoadingFirstPage" : all.length > limit ? "CanLoadMore" : "Exhausted",
    loadMore(numItems: number) {
      setPage({ key, limit: limit + numItems });
    },
  };
}
