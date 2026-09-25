import { v } from "convex/values";
import { createCampaign } from "./models/campaigns";
import { companyMutation } from "./lib/functions";
import schema from "./schema";

/**
 * Adds a campaign for a given company.
 *
 * @throws `invalid_state` for an invalid budget or schedule.
 * @returns the new campaign's id.
 */
export const create = companyMutation({
  args: schema.doc("campaigns").omit("_id", "_creationTime", "companyId", "createdBy").fields,
  returns: v.id("campaigns"),
  handler: async (ctx, args) => {
    return await createCampaign(ctx, {
      ...args,
      companyId: ctx.membership.companyId,
      createdBy: ctx.membership._id,
    });
  },
});
