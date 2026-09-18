import { v } from "convex/values";
import { insertCompanyCampaign } from "./models/campaigns";
import { companyMutation } from "./lib/functions";
import { campaignFormat, campaignStatus } from "./schemas/campaigns.schema";
import { requireMembership } from "./models/companyUsers";

/**
 * Adds a campaign for a given company..
 *
 * Validation lives in `insertCompanyCampaign`, not here.
 *
 * @throws `invalid_state` if `deadline` is in the past, if `maxOpenings` is
 * not positive, or if `maxApplications` does not exceed `maxOpenings`.
 * @returns the new campaign's id.
 */
export const create = companyMutation({
  args: {
    title: v.string(),
    description: v.string(),
    format: campaignFormat,
    status: campaignStatus,
    isVetted: v.boolean(),
    maxApplications: v.number(),
    maxOpenings: v.number(),
    deadline: v.number(),
    audience: v.optional(v.string()),
    talkingPoints: v.optional(v.array(v.string())),
    prohibitedClaims: v.optional(v.array(v.string())),
    disclosureRequirements: v.optional(v.array(v.string())),
    usageRights: v.optional(v.string()),
  },
  returns: v.id("campaigns"),
  handler: async (ctx, args) => {
    const membership = await requireMembership(ctx, ctx.user._id, ctx.orgId);

    return await insertCompanyCampaign(ctx, {
      ...args,
      companyId: membership.companyId,
      createdBy: membership._id,
    });
  },
});
