import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

/** One item of the creator feed, typed straight from the `discover` route. */
export type FeedOpportunity = FunctionReturnType<typeof api.opportunities.discover>["page"][number];

export type FeedView = "grid" | "list";

export type FeedType = "all" | "gated" | "open";

/** Everything that narrows the creator feed. Empty arrays and "all" mean no filter. */
export type FeedFilters = {
  search: string;
  type: FeedType;
  niches: string[];
  skills: string[];
  applied: boolean;
  starred: boolean;
};

export const NO_FEED_FILTERS: FeedFilters = {
  search: "",
  type: "all",
  niches: [],
  skills: [],
  applied: false,
  starred: false,
};
