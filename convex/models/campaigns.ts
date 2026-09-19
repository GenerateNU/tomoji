import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { apiError } from "../lib/errors";

/**
 * Creates a campaign for the caller's company.
 *
 * @returns the id of the newly created campaign.
 * @throws `invalid_state` if the deadline has passed, `maxOpenings` is not
 * positive, `maxApplications` is less than `maxOpenings`, or the campaign is
 * created with a `closed` status.
 * @throws `forbidden` if the caller is not a member of a company.
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
  if (campaign.status === "closed") {
    throw apiError("invalid_state", { reason: "campaign_cannot_be_created_closed" });
  }

  return await ctx.db.insert("campaigns", campaign);
}
