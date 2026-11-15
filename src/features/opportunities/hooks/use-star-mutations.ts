import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { setStarredLocally } from "../lib/star-optimistic-update";

/**
 * Returns a function that stars or unstars an opportunity. The star flips in
 * every cached view at once; Convex rolls it back if the mutation fails.
 */
export function useSetStarred() {
  const star = useMutation(api.opportunities.star).withOptimisticUpdate(
    (store, { opportunityId }) => setStarredLocally(store, opportunityId, true),
  );
  const unstar = useMutation(api.opportunities.unstar).withOptimisticUpdate(
    (store, { opportunityId }) => setStarredLocally(store, opportunityId, false),
  );
  return useCallback(
    (opportunityId: Id<"opportunities">, starred: boolean) =>
      (starred ? star : unstar)({ opportunityId }),
    [star, unstar],
  );
}
