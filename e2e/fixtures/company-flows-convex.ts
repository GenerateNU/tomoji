import { getFunctionName, type FunctionReference } from "convex/server";

/** Company-side responses for previewing campaign and opportunity screens; no deployment involved. */
const DAY = 86_400_000;
const now = Date.now();

export const CAMPAIGNS = [
  {
    _id: "campaign1",
    _creationTime: now - 40 * DAY,
    companyId: "company1",
    createdBy: "member1",
    title: "Opus 5.5",
    description: "A creator campaign showcasing Claude Opus 5.5 for complex reasoning and coding.",
    status: "open",
    budgetCents: 2_500_000,
    startsAt: now - 28 * DAY,
    endsAt: now + 60 * DAY,
  },
  {
    _id: "campaign2",
    _creationTime: now - 50 * DAY,
    companyId: "company1",
    createdBy: "member1",
    title: "Sonnet 5.5",
    description: "Everyday coding with Sonnet.",
    status: "open",
    budgetCents: 1_200_000,
    startsAt: now - 42 * DAY,
  },
];

function params() {
  return new URLSearchParams(location.search);
}

export function useConvexAuth() {
  return { isLoading: false, isAuthenticated: true };
}

export function usePaginatedQuery(reference: FunctionReference<"query">, args: unknown) {
  if (args === "skip" || params().has("loading")) {
    return { results: [], status: "LoadingFirstPage", loadMore() {} };
  }
  const name = getFunctionName(reference);
  if (name === "campaigns:list") {
    const status = (args as { status?: string }).status;
    return {
      results: params().has("empty") ? [] : CAMPAIGNS.filter((c) => !status || c.status === status),
      status: "Exhausted",
      loadMore() {},
    };
  }
  return { results: [], status: "Exhausted", loadMore() {} };
}

export function useQuery(reference: FunctionReference<"query">, args?: unknown) {
  if (args === "skip") return undefined;
  switch (getFunctionName(reference)) {
    case "users:me":
      return { synced: true, role: "company", companyRole: "admin", _id: "user1" };
    case "campaigns:get":
      return CAMPAIGNS.find((c) => c._id === (args as { campaignId: string }).campaignId);
    default:
      return undefined;
  }
}

export function useMutation() {
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    return "campaign-new";
  };
}

export function useAction() {
  return () => new Promise(() => {});
}
