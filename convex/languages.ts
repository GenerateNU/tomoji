import { v } from "convex/values";
import { authedQuery } from "./lib/functions";
import { language, listLanguages } from "./models/languages";

/** Returns the shared language options in display order, optionally searching names and labels. */
export const list = authedQuery({
  args: { search: v.optional(v.string()) },
  returns: v.array(language),
  handler: async (_ctx, args) => {
    return listLanguages(args.search);
  },
});
