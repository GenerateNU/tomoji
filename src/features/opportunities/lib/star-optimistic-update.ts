import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";

/**
 * Sets (never toggles, so stacked optimistic layers compose) `isStarred` for
 * one opportunity in every cached query that shows it. Rows are never removed
 * or inserted here, not even in the starred list: the server result adds or
 * drops them one round trip later, so no counts or page boundaries are guessed.
 */
export function setStarredLocally(
  store: OptimisticLocalStore,
  opportunityId: Id<"opportunities">,
  isStarred: boolean,
) {
  for (const { args, value } of store.getAllQueries(api.applications.searchMine)) {
    if (value === undefined || !value.rows.some((row) => row.opportunityId === opportunityId)) {
      continue;
    }
    store.setQuery(api.applications.searchMine, args, {
      ...value,
      rows: value.rows.map((row) =>
        row.opportunityId === opportunityId ? { ...row, isStarred } : row,
      ),
    });
  }

  for (const query of [api.opportunities.discover, api.opportunities.listStarred]) {
    for (const { args, value } of store.getAllQueries(query)) {
      if (value === undefined || !value.page.some((item) => item._id === opportunityId)) continue;
      store.setQuery(query, args, {
        ...value,
        page: value.page.map((item) =>
          item._id === opportunityId ? { ...item, isStarred } : item,
        ),
      });
    }
  }

  const one = store.getQuery(api.opportunities.get, { opportunityId });
  // Company and operator views have no `isStarred`; only the creator variant is patched.
  if (one !== undefined && "isStarred" in one) {
    store.setQuery(api.opportunities.get, { opportunityId }, { ...one, isStarred });
  }
}
