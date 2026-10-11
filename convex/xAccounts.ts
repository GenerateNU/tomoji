import { v } from "convex/values";
import { creatorQuery } from "./lib/functions";
import { getOwnXAccount, xAccount } from "./models/xAccounts";

/** Returns the current creator's linked X metadata, never their OAuth credentials. */
export const me = creatorQuery({
  args: {},
  returns: v.union(xAccount, v.null()),
  handler: async (ctx) => await getOwnXAccount(ctx, ctx.user),
});
