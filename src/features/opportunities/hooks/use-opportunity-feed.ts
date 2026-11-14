import { api } from "@convex/_generated/api";
import { usePaginatedQuery } from "convex/react";
import type { FeedFilters, FeedOpportunity } from "../lib/types";

const PAGE_SIZE = 12;

function matches(opportunity: FeedOpportunity, filters: FeedFilters): boolean {
  const search = filters.search.trim().toLowerCase();
  return (
    (search === "" || opportunity.title.toLowerCase().includes(search)) &&
    (filters.type === "all" || opportunity.isGated === (filters.type === "gated")) &&
    (filters.niches.length === 0 || filters.niches.some((n) => opportunity.niches.includes(n))) &&
    (filters.skills.length === 0 || filters.skills.some((s) => opportunity.skills.includes(s))) &&
    (!filters.applied || opportunity.application !== null) &&
    (!filters.eligible || opportunity.match.isEligible)
  );
}

/**
 * The creator's feed: open opportunities narrowed by the filters, or only
 * their starred ones. The server filters discovery; the starred list isn't
 * filtered there, so its loaded pages are narrowed here. Both queries are
 * declared so hooks run in the same order; the inactive one is skipped.
 * Cursors belong to the filters that made them, so Convex restarts pagination
 * whenever the arguments change.
 */
export function useOpportunityFeed(filters: FeedFilters) {
  const discover = usePaginatedQuery(
    api.opportunities.discover,
    filters.starred
      ? "skip"
      : {
          search: filters.search.trim() || undefined,
          isGated: filters.type === "all" ? undefined : filters.type === "gated",
          niches: filters.niches.length > 0 ? filters.niches : undefined,
          skills: filters.skills.length > 0 ? filters.skills : undefined,
          applied: filters.applied || undefined,
          eligible: filters.eligible || undefined,
        },
    { initialNumItems: PAGE_SIZE },
  );
  const starred = usePaginatedQuery(api.opportunities.listStarred, filters.starred ? {} : "skip", {
    initialNumItems: PAGE_SIZE,
  });
  const feed = filters.starred ? starred : discover;
  const results = filters.starred
    ? feed.results.filter((opportunity) => matches(opportunity, filters))
    : feed.results;
  return { ...feed, results, loadMore: () => feed.loadMore(PAGE_SIZE) };
}
