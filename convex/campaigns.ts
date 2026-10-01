import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import {
  campaignUpdate,
  closeCampaign,
  createCampaign,
  listCampaigns,
  pauseCampaign,
  publishCampaign,
  removeCampaign,
  requireCampaign,
  resumeCampaign,
  updateCampaign,
} from "./models/campaigns";
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
 * Updates the editable details of a campaign in the caller's company.
 * Open to any company member until the company-admin builder is available.
 * Omitted fields stay unchanged; `endsAt: null` removes the end date.
 *
 * @throws `not_found` if the campaign is missing or belongs to another company.
 * @throws `invalid_state` for blank fields or an invalid resulting budget or schedule.
 */
export const update = companyMutation({
  args: { campaignId: v.id("campaigns"), ...campaignUpdate.fields },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { campaignId, ...fields } = args;
    await updateCampaign(ctx, campaignId, ctx.membership.companyId, fields);
    return null;
  },
});

/**
 * Removes an empty draft in the caller's company.
 * Open to any company member until the company-admin builder is available.
 *
 * @throws `not_found` if the campaign is missing or belongs to another company.
 * @throws `invalid_state` if the campaign is not a draft or has any opportunities.
 */
export const remove = companyMutation({
  args: { campaignId: v.id("campaigns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await removeCampaign(ctx, args.campaignId, ctx.membership.companyId);
    return null;
  },
});

/**
 * Publishes a valid draft in the caller's company.
 * Open to any company member until the company-admin builder is available.
 *
 * @throws `not_found` if the campaign is missing or belongs to another company.
 * @throws `invalid_state` if it is not a draft, has invalid details, or has expired.
 */
export const publish = companyMutation({
  args: { campaignId: v.id("campaigns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await publishCampaign(ctx, args.campaignId, ctx.membership.companyId);
    return null;
  },
});

/**
 * Pauses an open campaign in the caller's company without changing its opportunities.
 * Open to any company member until the company-admin builder is available.
 *
 * @throws `not_found` if the campaign is missing or belongs to another company.
 * @throws `invalid_state` if the campaign is not open.
 */
export const pause = companyMutation({
  args: { campaignId: v.id("campaigns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await pauseCampaign(ctx, args.campaignId, ctx.membership.companyId);
    return null;
  },
});

/**
 * Resumes a valid paused campaign without changing its opportunities or assignments.
 * Open to any company member until the company-admin builder is available.
 *
 * @throws `not_found` if the campaign is missing or belongs to another company.
 * @throws `invalid_state` if it is not paused, has invalid details, or has expired.
 */
export const resume = companyMutation({
  args: { campaignId: v.id("campaigns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await resumeCampaign(ctx, args.campaignId, ctx.membership.companyId);
    return null;
  },
});

/**
 * Closes a draft, open, or paused campaign, preserving its opportunities and assignments.
 * An already-closed campaign is a successful no-op.
 * Open to any company member until the company-admin builder is available.
 *
 * @throws `not_found` if the campaign is missing or belongs to another company.
 */
export const close = companyMutation({
  args: { campaignId: v.id("campaigns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await closeCampaign(ctx, args.campaignId, ctx.membership.companyId);
    return null;
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
