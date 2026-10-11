import { v } from "convex/values";
import { creatorQuery } from "./lib/functions";
import { requireCallerCreatorId } from "./models/users";
import { getXAccount, xAccount } from "./models/xAccounts";

/** Returns the current creator's linked X metadata, never their OAuth credentials. */
export const me = creatorQuery({
  args: {},
  returns: v.union(xAccount, v.null()),
  handler: async (ctx) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return await getXAccount(ctx, creatorId);
  },
});
