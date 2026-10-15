import { api } from "@convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";

const PAGE_SIZE = 12;

/**
 * The creator's feed: open opportunities, or only their starred ones, both
 * filtered server-side by niche and access. Both queries are declared so hooks
 * run in the same order; the inactive one is skipped. Cursors belong to the
 * filters that made them, so changing a filter restarts pagination.
 */
export function useOpportunityFeed({
  niche,
  access,
  starredOnly,
}: {
  niche?: string;
  access?: FunctionArgs<typeof api.opportunities.discover>["access"];
  starredOnly: boolean;
}) {
  const discover = usePaginatedQuery(
    api.opportunities.discover,
    starredOnly ? "skip" : { niche, access },
    {
      initialNumItems: PAGE_SIZE,
    },
  );
  const starred = usePaginatedQuery(
    api.opportunities.listStarred,
    starredOnly ? { niche, access } : "skip",
    {
      initialNumItems: PAGE_SIZE,
    },
  );
  const feed = starredOnly ? starred : discover;
  return { ...feed, loadMore: () => feed.loadMore(PAGE_SIZE) };
}
