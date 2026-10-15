import { v } from "convex/values";
import { authedQuery } from "./lib/functions";
import { NICHES, niche } from "./models/niches";

/**
 * Returns the niches opportunities and creators can pick from, in display
 * order. The frontend reads the list from here rather than hard-coding it, so
 * moving niches to a table later doesn't change clients.
 */
export const list = authedQuery({
  args: {},
  returns: v.array(niche),
  handler: async () => {
    return [...NICHES];
  },
});
