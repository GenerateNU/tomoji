import { getFunctionName, type FunctionReference } from "convex/server";
import { ConvexError } from "convex/values";
import type { Id } from "@convex/_generated/dataModel";
import type { FeedOpportunity } from "@/features/opportunities/lib/types";

/** Synthetic service responses only; the browser renders the real feed and modal. */
function opportunity(id: string, title: string, isGated = true): FeedOpportunity {
  return {
    _id: id as Id<"opportunities">,
    _creationTime: 1_790_000_000_000,
    title,
    description: "Show developers how you use the product.",
    companyName: "Acme",
    status: "open",
    isGated,
    isStarred: false,
    usesAiReviewDefault: false,
    deadline: 1_900_000_000_000,
    maxSlots: 5,
    numFilledSlots: 0,
    maxApplications: 5,
    targetApplicant: "Developers",
    fixedFeeCents: 10000,
    cpmRateCents: 500,
    paymentCapCents: 25000,
    contentRequirements: "One short video",
    prohibitedClaims: "No unsupported claims",
    disclosureRequirements: "Include #ad",
    usageRights: "Organic reposts",
    niches: [],
  };
}

const opportunities = [
  opportunity("opportunity-a", "Developer tools launch"),
  opportunity("opportunity-b", "Agent tutorial"),
  opportunity("opportunity-open", "Open opportunity", false),
];

export const fixture = {
  calls: [] as { name: string; args: Record<string, unknown> }[],
  failNextApplication: false,
};

/** Answers only the modal's brief lookup and the feed's niche lookup. */
export function useQuery(reference: FunctionReference<"query">, args?: { opportunityId?: string }) {
  const name = getFunctionName(reference);
  if (name === "niches:list") return [];
  if (name === "opportunities:get") {
    return opportunities.find((item) => item._id === args?.opportunityId);
  }
  throw new Error(`Unexpected query: ${name}`);
}

/** Provides a bounded feed so the browser can exercise grid/list selection. */
export function usePaginatedQuery(reference: FunctionReference<"query">) {
  const name = getFunctionName(reference);
  if (name !== "opportunities:discover" && name !== "opportunities:listStarred") {
    throw new Error(`Unexpected paginated query: ${name}`);
  }
  return { results: opportunities, status: "Exhausted", loadMore() {} };
}

/** Records public mutation calls locally and simulates one structured failure. */
export function useMutation(reference: FunctionReference<"mutation">) {
  return async (args: Record<string, unknown>) => {
    const name = getFunctionName(reference);
    fixture.calls.push({ name, args });
    if (name === "applications:create") {
      if (fixture.failNextApplication) {
        fixture.failNextApplication = false;
        throw new ConvexError({ code: "conflict" });
      }
      return "application-test";
    }
    if (name !== "opportunities:star" && name !== "opportunities:unstar") {
      throw new Error(`Unexpected mutation: ${name}`);
    }
  };
}
