import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAllActiveCompanyCampaigns, insertCompanyCampaign } from "./models/campaigns";

// This projection is the public contract for campaigns browsed by anyone,
// including signed-out visitors. New schema fields do not become public
// automatically — add them here deliberately.
export const companyActiveCampaigns = query({
  args: { companyId: v.id("companies") },
  returns: v.array(
    v.object({
      _id: v.id("campaigns"),
      _creationTime: v.number(),
      companyId: v.id("companies"),
      title: v.string(),
      description: v.string(),
      format: v.union(
        v.literal("video"),
        v.literal("photo"),
        v.literal("photo_and_text"),
        v.literal("video_and_text"),
      ),
      isVetted: v.boolean(),
      maxOpenings: v.number(),
      deadline: v.number(),
      audience: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const campaigns = await getAllActiveCompanyCampaigns(ctx, args.companyId, Date.now());
    return campaigns.map((campaign) => ({
      _id: campaign._id,
      _creationTime: campaign._creationTime,
      companyId: campaign.companyId,
      title: campaign.title,
      description: campaign.description,
      format: campaign.format,
      isVetted: campaign.isVetted,
      maxOpenings: campaign.maxOpenings,
      deadline: campaign.deadline,
      audience: campaign.audience ?? null,
    }));
  },
});

// TODO(auth): this mutation is intentionally unauthenticated for now — auth is
// being added later. Until then any caller can create a campaign for any
// company, attribute it to any createdBy, and set isVetted. Must not reach a
// real deployment in this state.
/**
 * Adds a campaign for a given company
 *
 */
export const addCampaign = mutation({
  args: {
    companyId: v.id("companies"),
    // createdBy is a client argument only until auth lands; it should then be
    // derived from the caller's company membership instead.
    createdBy: v.id("companyUsers"),
    title: v.string(),
    description: v.string(),
    format: v.union(
      v.literal("video"),
      v.literal("photo"),
      v.literal("photo_and_text"),
      v.literal("video_and_text"),
    ),
    status: v.union(v.literal("draft"), v.literal("open"), v.literal("closed")),
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
    return await insertCompanyCampaign(ctx, args);
  },
});
