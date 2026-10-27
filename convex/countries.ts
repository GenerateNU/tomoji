import { v } from "convex/values";
import { authedQuery } from "./lib/functions";
import { COUNTRIES, country } from "./models/countries";

/**
 * Returns every country a creator can claim as their residence, sorted by
 * name. The frontend reads the list from here so the ISO data stays on the
 * server and clients never hard-code it.
 */
export const list = authedQuery({
  args: {},
  returns: v.array(country),
  handler: async () => {
    return [...COUNTRIES];
  },
});
