import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { createCampaign, listCampaigns, requireCampaign } from "./models/campaigns";
import { companyMutation, companyQuery } from "./lib/functions";
import schema from "./schema";
import { campaignStatus } from "./schemas/campaigns.schema";

/**
 * Gets a campaign in any status from the caller's company.
 *
 * @throws `not_found` if the campaign is missing or belongs to another company.
 */
export const get = companyQuery({
  args: { campaignId: v.id("campaigns") },
  returns: schema.doc("campaigns"),
  handler: async (ctx, args) => {
    return await requireCampaign(ctx, args.campaignId, ctx.membership.companyId);
  },
});

/** Lists the caller's company campaigns newest first, optionally filtered by status. */
export const list = companyQuery({
  args: {
    status: v.optional(campaignStatus),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(schema.doc("campaigns")),
  handler: async (ctx, args) => {
    return await listCampaigns(ctx, ctx.membership.companyId, args);
  },
});

/**
 * Creates a draft or open campaign for the caller's company.
 * Open to any company member until the company-admin builder is available.
 *
 * @throws `invalid_state` for blank brief fields or an invalid budget or schedule.
 * @returns the new campaign's id.
 */
export const create = companyMutation({
  args: schema
    .doc("campaigns")
    .omit("_id", "_creationTime", "companyId", "createdBy")
    .extend({ status: v.union(v.literal("draft"), v.literal("open")) }).fields,
  returns: v.id("campaigns"),
  handler: async (ctx, args) => {
    return await createCampaign(ctx, {
      ...args,
      companyId: ctx.membership.companyId,
      createdBy: ctx.membership._id,
    });
  },
});
