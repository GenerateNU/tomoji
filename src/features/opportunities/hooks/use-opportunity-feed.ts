import { api } from "@convex/_generated/api";
import { usePaginatedQuery } from "convex/react";

const PAGE_SIZE = 12;

/**
 * The creator's feed: open opportunities (optionally in one niche), or only
 * their starred ones. Both queries are declared so hooks run in the same order;
 * the inactive one is skipped. Cursors belong to the filters that made them,
 * so Convex restarts pagination whenever the arguments change.
 */
export function useOpportunityFeed({
  niche,
  starredOnly,
}: {
  niche?: string;
  starredOnly: boolean;
}) {
  const discover = usePaginatedQuery(api.opportunities.discover, starredOnly ? "skip" : { niche }, {
    initialNumItems: PAGE_SIZE,
  });
  const starred = usePaginatedQuery(api.opportunities.listStarred, starredOnly ? {} : "skip", {
    initialNumItems: PAGE_SIZE,
  });
  const feed = starredOnly ? starred : discover;
  return { ...feed, loadMore: () => feed.loadMore(PAGE_SIZE) };
}
