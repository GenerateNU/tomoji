import { v } from "convex/values";
import { authedQuery, companyMutation } from "./lib/functions";
import { findOrgId } from "./lib/identity";
import {
  createOpportunity,
  creatorOpportunity,
  getOpportunity,
  opportunityCreate,
} from "./models/opportunities";
import schema from "./schema";

/** Creates a draft or open opportunity in a campaign owned by the caller's company. */
export const create = companyMutation({
  args: opportunityCreate.fields,
  returns: v.id("opportunities"),
  handler: async (ctx, args) => {
    return await createOpportunity(ctx, ctx.membership, args);
  },
});

/** Returns a public brief to creators or the complete document to its company and operators. */
export const get = authedQuery({
  args: { opportunityId: v.id("opportunities") },
  returns: v.union(schema.doc("opportunities"), creatorOpportunity),
  handler: async (ctx, args) => {
    return await getOpportunity(ctx, args.opportunityId, {
      user: ctx.user,
      orgId: findOrgId(ctx.identity),
    });
  },
});
