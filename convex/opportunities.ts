import { v } from "convex/values";
import { companyMutation } from "./lib/functions";
import { createOpportunity, opportunityCreate } from "./models/opportunities";

/** Creates a draft or open opportunity in a campaign owned by the caller's company. */
export const create = companyMutation({
  args: opportunityCreate.fields,
  returns: v.id("opportunities"),
  handler: async (ctx, args) => {
    return await createOpportunity(ctx, ctx.membership, args);
  },
});
