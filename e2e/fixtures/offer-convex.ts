import { getFunctionName, type FunctionReference } from "convex/server";
import * as session from "./settings-convex";
import { api } from "../../convex/_generated/api";
import * as feed from "./opportunity-feed-convex";

export const { useConvexAuth, useQueries, useConvex, useAction, usePaginatedQuery } = session;
export function useMutation() {
  return async () => null;
}
export function useQuery(reference: FunctionReference<"query">, args?: unknown) {
  if (args === "skip") return undefined;
  if (["niches:list", "skills:list", "languages:list"].includes(getFunctionName(reference)))
    return feed.useQuery(reference, args);
  if (getFunctionName(reference) !== "applications:getMineDetail")
    return session.useQuery(reference, args);
  const state = new URLSearchParams(location.search).get("state") ?? "accepted";
  const live = state === "live";
  const opportunity = feed.usePaginatedQuery(api.opportunities.discover, {}).results[0];
  return {
    applicationId: "application0",
    status: live
      ? "offered"
      : state === "expired"
        ? "offerExpired"
        : state === "declined"
          ? "declined"
          : "accepted",
    offerAcceptedAt: Date.now() - 86400000,
    submittedAt: Date.now() - 3 * 86400000,
    offerExpiresAt: Date.now() + (state === "expired" ? -1 : 3) * 86400000,
    canAccept: live,
    canDecline: live,
    termsRequired: live,
    minFollowerRange: null,
    opportunity: {
      ...opportunity,
      reviewPolicy: "Include the sponsorship disclosure.\nShow the final result.",
    },
  };
}
