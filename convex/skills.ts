import { v } from "convex/values";
import { authedQuery } from "./lib/functions";
import { listSkills, skill } from "./models/skills";

/** Returns the shared skill options in display order, optionally searching names and labels. */
export const list = authedQuery({
  args: { search: v.optional(v.string()) },
  returns: v.array(skill),
  handler: async (_ctx, args) => {
    return listSkills(args.search);
  },
});
