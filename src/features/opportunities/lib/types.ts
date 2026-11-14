import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

/** One item of the creator feed, typed straight from the `discover` route. */
export type FeedOpportunity = FunctionReturnType<typeof api.opportunities.discover>["page"][number];

export type FeedView = "grid" | "list";
