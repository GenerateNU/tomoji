import { useSyncExternalStore } from "react";
import { getFunctionName, type FunctionReference, type FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// Test-only stand-in for the Posts page's Convex reads. Every value here is a
// fixture for browser tests, not data the product ships.
type PostList = FunctionReturnType<typeof api.posts.listMine>;
type PostDetail = FunctionReturnType<typeof api.posts.getMine>;

const DAY = 86_400_000;
const now = Date.now();
const parameters = new URLSearchParams(location.search);

const assignmentId = "assignment-gemini" as Id<"assignments">;
const posts: PostList["posts"] = [
  {
    postId: "post-research" as Id<"posts">,
    assignmentId,
    url: "https://x.com/zahratech/status/1843000000000000001",
    isVerified: true,
    postedAt: now - 2 * DAY,
    caption: "Fifty papers, one afternoon, zero burnout. My research stack with Gemini in Docs.",
    mediaId: "media-research" as Id<"mediaUploads">,
    title: "Research Faster: Summarizing 50 Papers in an Afternoon",
    opportunityTitle: "Gemini for Workspace",
    companyName: "Google",
    views: 648_644,
    likes: 35_675,
    comments: 7_135,
    reposts: 1_204,
    earnings: 104_620,
  },
  {
    postId: "post-copilot" as Id<"posts">,
    assignmentId: "assignment-copilot" as Id<"assignments">,
    url: "https://x.com/zahratech/status/1843000000000000002",
    isVerified: true,
    postedAt: now - 6 * DAY,
    caption: "Refactoring a legacy codebase live, with an assistant doing the boring parts.",
    title: "Refactoring a Legacy Codebase Live with Copilot",
    opportunityTitle: "GitHub Copilot",
    companyName: "GitHub",
    views: 120_400,
    likes: 8_210,
    comments: 402,
    earnings: 81_275,
  },
  {
    postId: "post-edge" as Id<"posts">,
    assignmentId: "assignment-workers" as Id<"assignments">,
    url: "https://x.com/zahratech/status/1843000000000000003",
    isVerified: false,
    postedAt: now - 9 * DAY,
    title: "Shipping an App to the Edge in 10 Minutes",
    opportunityTitle: "Cloudflare Workers",
    companyName: "Cloudflare",
    earnings: 0,
  },
];

const listeners = new Set<() => void>();
let revision = 0;
let session = {
  empty: parameters.has("empty"),
  failedQuery: parameters.get("failedQuery") ?? "",
};
const queries: { name: string; args: unknown }[] = [];

function notify() {
  revision += 1;
  for (const listener of listeners) listener();
}

export const fixture = {
  queries,
  setSession(updates: Partial<typeof session>) {
    session = { ...session, ...updates };
    notify();
  },
};

function useRevision() {
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => revision,
  );
}

export function useConvexAuth() {
  useRevision();
  return { isAuthenticated: true, isLoading: false };
}

export function useQuery(reference: FunctionReference<"query">, args?: unknown) {
  useRevision();
  return queryResult(reference, args ?? {});
}

export function useQueries(
  requests: Record<string, { query: FunctionReference<"query">; args: unknown }>,
) {
  useRevision();
  return Object.fromEntries(
    Object.entries(requests).map(([key, { query, args }]) => {
      try {
        return [key, queryResult(query, args)];
      } catch (error) {
        return [key, error];
      }
    }),
  );
}

const client = {
  async query(reference: FunctionReference<"query">, args: unknown) {
    return queryResult(reference, args);
  },
};

export function useConvex() {
  return client;
}

const emptyNotifications: never[] = [];

export function usePaginatedQuery(reference: FunctionReference<"query">, args: unknown) {
  useRevision();
  const name = getFunctionName(reference);
  if (name !== "notifications:list") throw new Error(`Unexpected paginated query: ${name}`);
  return {
    results: emptyNotifications,
    status: args === "skip" ? ("LoadingFirstPage" as const) : ("Exhausted" as const),
    loadMore() {},
  };
}

// Stable results, as Convex returns the same object until data changes.
const fullList: PostList = { posts, metricsUpdatedAt: now - 2 * 3_600_000, isPartial: false };
const emptyList: PostList = { posts: [], metricsUpdatedAt: null, isPartial: false };
const viewEvents = [
  { at: now - 9 * DAY, amount: 40_000 },
  { at: now - 6 * DAY, amount: 120_400 },
  { at: now - 2 * DAY, amount: 300_000 },
  { at: now - DAY, amount: 348_644 },
];
const viewHistory = { total: 809_044, views: viewEvents, isPartial: false };
const emptyHistory = { total: 0, views: [], isPartial: false };
const summary = {
  total: 185_895,
  previousTotal: null,
  earnings: [
    { at: now - 5 * DAY, amount: 81_275 },
    { at: now - DAY, amount: 104_620 },
  ],
  topPosts: [],
  isPartial: false,
};
const emptySummary = { ...summary, total: 0, earnings: [] };
const details = new Map<string, PostDetail>(
  posts.map((post) => [
    post.postId,
    {
      ...post,
      fixedFeeCents: 50_000,
      cpmRateCents: 400,
      paymentCapCents: 500_000,
      earningsHistory:
        post.earnings === 0
          ? []
          : [
              { at: post.postedAt + DAY, amount: 50_000 },
              { at: post.postedAt + 2 * DAY, amount: post.earnings - 50_000 },
            ],
      isPartial: false,
    },
  ]),
);

function queryResult(reference: FunctionReference<"query">, args: unknown) {
  if (args === "skip") return undefined;
  const name = getFunctionName(reference);
  queries.push({ name, args });
  if (session.failedQuery === name) throw new Error("Simulated query failure");
  switch (name) {
    case "notifications:unreadCount":
      return 0;
    case "users:me":
      return {
        synced: true,
        role: "creator",
        userId: "test-user",
        firstName: "Zahra",
        lastName: "Wibisana",
        email: "zahra@example.test",
      };
    case "xAccounts:me":
      return {
        xAccountId: "x-account",
        xUserId: "1",
        username: "zahratech",
        displayName: "Zahra",
        linkedAt: now - 30 * DAY,
        updatedAt: now - 30 * DAY,
        status: "active",
      };
    case "stripeAccounts:me":
      return { status: "complete" };
    case "posts:listMine":
      return session.empty ? emptyList : fullList;
    case "posts:viewHistory":
      if (session.empty) return emptyHistory;
      if ((args as { postId?: string }).postId) {
        return { total: 648_644, views: viewEvents.slice(1), isPartial: false };
      }
      return viewHistory;
    case "payouts:summary":
      return session.empty ? emptySummary : summary;
    case "posts:getMine": {
      const detail = details.get((args as { postId: string }).postId);
      if (!detail) throw new Error("Unknown post");
      return detail;
    }
  }
  throw new Error(`Unexpected query: ${name}`);
}

// One stable function per operation, as Convex's hooks return.
const operations = new Map<string, () => Promise<never>>();

function operation(reference: FunctionReference<"mutation" | "action">) {
  const name = getFunctionName(reference);
  if (!operations.has(name)) {
    operations.set(name, async () => {
      // Private media can't be fetched in the fixture; the UI falls back to
      // initials and a retry for the video.
      throw new Error(`Fixture has no backend for ${name}`);
    });
  }
  return operations.get(name)!;
}

export const useMutation = operation;
export const useAction = operation;
