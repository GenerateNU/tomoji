import { v } from "convex/values";
import { createCampaign } from "./models/campaigns";
import { companyMutation } from "./lib/functions";
import schema from "./schema";

/**
 * Creates a campaign for the caller's company.
 *
 * @returns the id of the newly created campaign.
 * @throws `forbidden` if the caller does not have permission to create campaigns.
 * @throws `invalid_state` if the campaign cannot be created with the requested values.
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
