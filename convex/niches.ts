import { v } from "convex/values";
import { authedQuery } from "./lib/functions";
import { listNiches, niche } from "./models/niches";

/**
 * Returns the shared niche options in display order, optionally searching names and labels.
 */
export const list = authedQuery({
  args: { search: v.optional(v.string()) },
  returns: v.array(niche),
  handler: async (_ctx, args) => {
    return listNiches(args.search);
  },
});
