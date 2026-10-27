import { useState, useSyncExternalStore } from "react";
import { getFunctionName, type FunctionReference, type FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import type { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";

let invites: Doc<"invites">[] = ["zahra@example.com", "cole@example.com", "sophia@example.com"].map(
  (email, i) => ({
    _id: `invite-${i}` as Id<"invites">,
    _creationTime: 1790000000000,
    workosId: `workos-${i}`,
    email,
    kind: "companyUser",
    companyId: "company" as Id<"companies">,
    role: i === 0 ? "admin" : "member",
    expiresAt: Date.parse("2026-11-01T12:00Z"),
  }),
);
let version = 0;
const listeners = new Set<() => void>();
const update = () => {
  version++;
  listeners.forEach((listener) => listener());
};
export const fixture = {
  mode: new URLSearchParams(location.search).get("scenario") ?? "admin",
  queries: [] as string[],
  calls: [] as { name: string; args: Record<string, unknown> }[],
  fail: false,
  hold: false,
  release: null as (() => void) | null,
  ready() {
    this.mode = "admin";
    update();
  },
  webhook() {
    invites = invites.filter((invite) => invite._id !== "invite-0");
    update();
  },
};

/** The real client subscribes per query, so every hook here must too. */
function useFixtureStore() {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => version,
  );
}

/** Notifies the UI about synthetic service responses only, with no WorkOS or Convex requests. */
export function useConvexAuth() {
  useFixtureStore();
  // `auth` is authentication in progress, not signed out. The real hook
  // reports that as isLoading, and useMe relies on the difference.
  return { isAuthenticated: fixture.mode !== "auth", isLoading: fixture.mode === "auth" };
}

/** Mirrors the generated identity response for each permission state. */
export function useQuery(
  reference: FunctionReference<"query">,
  args: unknown,
): FunctionReturnType<typeof api.users.me> | undefined {
  useFixtureStore();
  if (getFunctionName(reference) !== "users:me") throw new Error("Unexpected query");
  if (args === "skip") return undefined;
  if (fixture.mode === "unsynced") return { synced: false };
  const base = {
    synced: true as const,
    userId: "viewer" as Id<"users">,
    email: "admin@example.com",
    firstName: undefined,
    lastName: undefined,
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

/** Supplies a paginated outstanding list whose rows change only when the webhook is simulated. */
export function usePaginatedQuery(reference: FunctionReference<"query">, args: unknown) {
  useFixtureStore();
  const [limit, setLimit] = useState(2);
  const name = getFunctionName(reference);
  if (name !== "invites:listMine") throw new Error("Unexpected list query");
  if (args !== "skip") fixture.queries.push(name);
  const all = args === "skip" || fixture.mode === "empty" ? [] : invites;
  return {
    results: all.slice(0, limit),
    status: args === "skip" ? "LoadingFirstPage" : all.length > limit ? "CanLoadMore" : "Exhausted",
    loadMore(numItems: number) {
      setLimit(limit + numItems);
    },
  };
}

/** Actions remain pending until released; successful calls do not optimistically rewrite invitations. */
export function useAction(reference: FunctionReference<"action">) {
  return async (args: Record<string, unknown>) => {
    const name = getFunctionName(reference);
    if (name !== "invites:inviteTeammate" && name !== "invites:revokeMine")
      throw new Error("Unexpected action");
    fixture.calls.push({ name, args });
    if (fixture.hold)
      await new Promise<void>((resolve) => {
        fixture.release = resolve;
      });
    if (fixture.fail) {
      fixture.fail = false;
      throw new ConvexError(
        name === "invites:inviteTeammate"
          ? { code: "conflict", reason: "invite_already_pending" }
          : { code: "not_found" },
      );
    }
    return null;
  };
}
