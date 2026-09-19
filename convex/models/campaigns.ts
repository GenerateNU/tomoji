import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { apiError } from "../lib/errors";

/**
 * Creates a campaign and returns its id.
 *
 * @param ctx service for convex mutation functions
 * @param campaign the campaign object with at least all required fields
 *
 * @return the campaignId of the new campaign
 * @throws `invalid_state` if `deadline` is in the past, if `maxOpenings` is
 * not positive, if `maxApplications` is below `maxOpenings`, or if `status`
 * is `closed`.
 */
export async function createCampaign(
  ctx: MutationCtx,
  campaign: WithoutSystemFields<Doc<"campaigns">>,
): Promise<Id<"campaigns">> {
  if (campaign.deadline <= Date.now()) {
    throw apiError("invalid_state", { reason: "deadline_in_past" });
  }
  if (campaign.maxOpenings <= 0) {
    throw apiError("invalid_state", { reason: "max_openings_not_positive" });
  }
  if (campaign.maxApplications < campaign.maxOpenings) {
    throw apiError("invalid_state", {
      reason: "max_applications_below_max_openings",
    });
  }
  if (campaign.status == "closed") {
    throw apiError("invalid_state", { reason: "campaign_cannot_be_created_closed" });
  }

  return await ctx.db.insert("campaigns", campaign);
}
