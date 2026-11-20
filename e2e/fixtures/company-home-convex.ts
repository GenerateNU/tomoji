import { useSyncExternalStore } from "react";
import { getFunctionName, type FunctionReference, type FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";

const listeners = new Set<() => void>();
let revision = 0;
const scenario = new URLSearchParams(location.search).get("scenario") ?? "populated";
let loading = scenario === "loading";
let failure = scenario === "error";
let earningsFailure = false;
let approveFailure = false;
const calls: { name: string; args: Record<string, unknown> }[] = [];
const now = Date.now();
const day = 86_400_000;
const empty = scenario === "empty";
const held = scenario === "held" || scenario === "notifications-held";
const me = {
  synced: true,
  role: "company",
  userId: "user-home",
  firstName: "Aaron",
  lastName: "Thomas",
  email: "aaron@example.test",
  orgId: "org_home",
  companyRole: scenario === "member" ? "member" : "admin",
};
const names = ["Jake Shane", "Kendall Jenner", "Charli D’Amelio", "Omar Reyes", "Leana Gonzalez"];
const offers = {
  count: empty ? 0 : 5,
  isPartial: scenario === "partial",
  rows: empty
    ? []
    : names.map((creatorName, i) => ({
        applicationId: `application-${i}`,
        opportunityId: `opportunity-${i}`,
        opportunityTitle: [
          "Opus 5.5",
          "Opus Walkthrough",
          "Opus Walkthrough",
          "Opus Reaction",
          "Opus Reaction",
        ][i],
        creatorName,
        profilePictureMediaId: null,
        expiresAt: now + [1, 2, 4, 5, 6][i] * day,
      })),
};
const drafts = {
  count: empty ? 0 : 4,
  isPartial: false,
  rows: empty
    ? []
    : ["Jake Shane", "Brittany Broski", "Selena Gomez", "Leana Gonzalez"].map((creatorName, i) => ({
        submissionId: `submission-${i}`,
        assignmentId: `assignment-${i}`,
        title: `Draft ${i + 1}`,
        creatorName,
        submittedAt: now - [2, 3, 14, 24][i] * 3_600_000,
        mediaId: null,
      })),
};
const points = [60, 63, 68, 78, 90, 74, 83, 100];
const overview = {
  liveCampaigns: { value: empty ? 0 : 3, capped: scenario === "partial" },
  spend: {
    amounts: empty ? [] : [{ currency: "usd", amount: 785000 }],
    campaignCount: empty ? 0 : 3,
    isPartial: false,
  },
  performance: {
    views: empty ? 0 : scenario === "missing" ? null : 1200000,
    postsWithoutMetrics: scenario === "missing" ? 1 : 0,
    isPartial: false,
    history: empty
      ? []
      : scenario === "missing"
        ? [{ at: now - day, views: null }]
        : points.map((views, i) => ({ at: now - (7 - i) * day, views })),
  },
};
let earnings = {
  creators: { pending: empty ? 0 : 3, approved: empty ? 0 : 2, total: empty ? 0 : 5 },
  pending: {
    amounts: empty ? [] : [{ currency: "usd", amount: 241000 }],
    blockedAmounts: held ? [{ currency: "usd", amount: 241000 }] : [],
    nextApprovalDueAt: empty || held ? null : now + 2 * day,
  },
  approvedInPeriod: { amounts: empty ? [] : [{ currency: "usd", amount: 138000 }] },
  canApprove: scenario !== "member",
  isPartial: false,
};
const notificationMode = scenario.startsWith("notifications");
let notifications = [
  {
    title: "Brittany Broski resubmitted “Debugging with Opus”",
    body: "Opus walkthrough.",
    type: "submissionResubmitted",
    target: { kind: "submission", submissionId: "submission-0", assignmentId: "assignment-0" },
  },
  {
    title: "Jake Shane declined the assignment terms",
    body: "Opus 5.5 post. His slot is open again.",
    type: "assignmentTermsDeclined",
    target: { kind: "assignment", assignmentId: "assignment-1" },
  },
  {
    title: "Your offer to Leana Gonzalez expired",
    body: "Opus 5.5 post. 1 slot still open.",
    type: "applicationOfferExpired",
    target: { kind: "application", applicationId: "application-2", opportunityId: "opportunity-2" },
  },
  {
    title: "Julia Rowniewski accepted the assignment terms",
    body: "Opus walkthrough is now full",
    type: "assignmentTermsAccepted",
    target: { kind: "assignment", assignmentId: "assignment-3" },
  },
  {
    title: "Leana Gonzalez claimed a spot",
    body: "Opus 5.5",
    type: "assignmentClaimed",
    target: { kind: "assignment", assignmentId: "assignment-4" },
  },
  {
    title: "Opus walkthrough is closed",
    body: "All slots filled. No new applications.",
    type: "opportunityClosed",
    target: { kind: "opportunity", opportunityId: "opportunity-5" },
  },
].map((row, i) => ({
  ...row,
  _id: `notification-${i}`,
  userId: me.userId,
  isRead: i >= 3,
  _creationTime: now - [1, 3, 6, 24, 25, 26][i] * 3_600_000,
}));
const notificationPages = new Map<string, typeof notifications>();
let payouts = empty
  ? []
  : [
      {
        _id: "payout-1",
        _creationTime: now,
        assignmentId: "assignment-0",
        creatorId: "creator-0",
        companyId: "company-home",
        campaignId: "campaign-home",
        postId: "post-home",
        amount: 241000,
        currency: "usd",
        reviewRequestedAt: now,
        approvalDueAt: now + 2 * day,
        approvalStatus: "pending",
        paymentStatus: "notStarted",
        review: {
          hasOpenDispute: held,
          canApprove: !held && scenario !== "member",
        },
      },
    ];
/** Publishes an immutable revision to the production hooks. */
function notify() {
  revision++;
  for (const listener of listeners) listener();
}
/** Reads deterministic service responses; only this isolated bundle imports the adapter. */
function read(name: string, args: Record<string, unknown>): unknown {
  if (name === "users:me") return scenario === "creator" ? { ...me, role: "creator" } : me;
  if (name === "companies:me")
    return { _id: "company-home", _creationTime: now, name: "Anthropic", isActive: true };
  if (name === "notifications:unreadCount")
    return notificationMode ? notifications.filter((n) => !n.isRead).length : 0;
  if (name.startsWith("companyHome:")) {
    if (loading) return undefined;
    if (failure) throw new Error("Simulated dashboard failure");
    if (name === "companyHome:earnings" && earningsFailure)
      throw new Error("Simulated earnings failure");
    const summaries: Record<string, unknown> = {
      "companyHome:overview": overview,
      "companyHome:offers": offers,
      "companyHome:drafts": drafts,
      "companyHome:earnings": earnings,
    };
    return summaries[name];
  }
  if (name === "submissions:listCompanyQueue")
    return {
      isCapped: false,
      rows: drafts.rows.map((r) => ({
        ...r,
        deliverableId: `deliverable-${r.submissionId}`,
        campaignId: "campaign-home",
        campaignTitle: "Opus 5.5",
        round: 1,
        roundIsCapped: false,
        status: "pending",
      })),
    };
  if (name === "submissions:list")
    return {
      page: [
        {
          _id: "submission-0",
          _creationTime: now,
          status: "pending",
          assignmentId: "assignment-0",
          deliverableId: "deliverable-submission-0",
          usesAiReview: false,
          closedWithoutReview: false,
          caption: "A practical Claude walkthrough. #ad",
          draftDescription: "Show the finished result.",
        },
      ],
      isDone: true,
      continueCursor: "",
    };
  if (name === "creators:get")
    return { firstName: "Jake", lastName: "Shane", email: "jake@example.test" };
  if (name === "payouts:list") return { page: payouts, isDone: true, continueCursor: "" };
  if (name === "opportunities:get") return undefined;
  if (name === "notifications:list") {
    const key = `${revision}|${args.isRead}`;
    if (!notificationPages.has(key))
      notificationPages.set(
        key,
        notificationMode
          ? notifications.filter((n) => args.isRead === undefined || n.isRead === args.isRead)
          : [],
      );
    return { page: notificationPages.get(key)!, isDone: true, continueCursor: "" };
  }
  if (name === "notifications:markRead") return null;
  void args;
  return undefined;
}
export const fixture = {
  calls,
  ready() {
    loading = false;
    failure = false;
    earningsFailure = false;
    notify();
  },
  failApproval() {
    approveFailure = true;
  },
  beginRefresh() {
    loading = true;
    notify();
  },
  endRefresh() {
    loading = false;
    notify();
  },
  /** Simulates a recoverable read error without replacing the notification list. */
  failEarnings() {
    earningsFailure = true;
    notify();
  },
  /** Reactive summary after the last outstanding approval is completed elsewhere. */
  completeEarnings() {
    earnings = {
      ...earnings,
      creators: { ...earnings.creators, pending: 0 },
      pending: { ...earnings.pending, amounts: [], blockedAmounts: [], nextApprovalDueAt: null },
    };
    notify();
  },
};
/** Shares a revision snapshot between all fixture hooks. */
function useRevision() {
  useSyncExternalStore(
    (callback) => {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    () => revision,
    () => revision,
  );
}
/** Supplies the authenticated fixture session without contacting WorkOS. */
export function useConvexAuth() {
  return { isAuthenticated: true, isLoading: false };
}

/** Matches the imperative reader used by existing profile components in the shared shell. */
export function useConvex() {
  return {
    query: async (query: FunctionReference<"query">, args: Record<string, unknown>) =>
      read(getFunctionName(query), args),
  };
}
/** Subscribes the production reader to the current fixture revision. */
export function useQuery<Q extends FunctionReference<"query">>(
  query: Q,
  args: Q["_args"] | "skip" = {},
): FunctionReturnType<Q> | undefined {
  useRevision();
  return args === "skip"
    ? undefined
    : (read(getFunctionName(query), args) as FunctionReturnType<Q> | undefined);
}
/** Mirrors batched Convex reads, including per-query errors. */
export function useQueries(
  queries: Record<string, { query: FunctionReference<"query">; args: Record<string, unknown> }>,
) {
  useRevision();
  return Object.fromEntries(
    Object.entries(queries).map(([key, { query, args }]) => {
      try {
        return [key, read(getFunctionName(query), args)];
      } catch (e) {
        return [key, e];
      }
    }),
  );
}
/** Exposes the deterministic one-page fixture through the pagination contract. */
export function usePaginatedQuery<Q extends FunctionReference<"query">>(
  query: Q,
  args: Record<string, unknown> | "skip",
) {
  useRevision();
  const value =
    args === "skip"
      ? undefined
      : (read(getFunctionName(query), args) as { page: unknown[] } | undefined);
  return {
    results: value?.page ?? [],
    status: value ? ("Exhausted" as const) : ("LoadingFirstPage" as const),
    loadMore() {},
  };
}
const mutations = new Map<string, (args: Record<string, unknown>) => Promise<unknown>>();
/** Records writes and simulates approval success or a recoverable failure. */
export function useMutation(query: FunctionReference<"mutation">) {
  const name = getFunctionName(query);
  if (!mutations.has(name))
    mutations.set(name, async (args) => {
      calls.push({ name, args });
      if (name === "payouts:approve") {
        if (approveFailure) {
          approveFailure = false;
          throw new ConvexError({ code: "upstream_failure" });
        }
        payouts = [];
        notify();
      }
      if (name === "notifications:markRead") {
        notifications = notifications.map((n) =>
          n._id === args.notificationId ? { ...n, isRead: true } : n,
        );
        notify();
      }
      return null;
    });
  return mutations.get(name)!;
}
const actions = new Map<string, () => Promise<unknown>>();
/** Keeps private media unavailable so the actual component exercises its fallback. */
export function useAction(query: FunctionReference<"action">) {
  const name = getFunctionName(query);
  if (!actions.has(name))
    actions.set(name, async () => {
      throw new Error("Fixture has no private media");
    });
  return actions.get(name)!;
}
