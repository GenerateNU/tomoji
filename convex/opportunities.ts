import { v } from "convex/values";
import { authedQuery, companyMutation } from "./lib/functions";
import { findOrgId } from "./lib/identity";
import { createOpportunity, opportunityCreate, requireOpportunity } from "./models/opportunities";
import schema from "./schema";

/** Creates a draft or open opportunity in a campaign owned by the caller's company. */
export const create = companyMutation({
  args: opportunityCreate.fields,
  returns: v.id("opportunities"),
  handler: async (ctx, args) => {
    return await createOpportunity(ctx, ctx.membership, args);
  },
});

/** Returns a complete opportunity with company, creator, and operator visibility checks. */
export const get = authedQuery({
  args: { opportunityId: v.id("opportunities") },
  returns: schema.doc("opportunities"),
  handler: async (ctx, args) => {
    return await requireOpportunity(ctx, args.opportunityId, {
      user: ctx.user,
      orgId: findOrgId(ctx.identity),
    });
  },
});
