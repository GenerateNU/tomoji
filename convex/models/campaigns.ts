import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { apiError } from "../lib/errors";

/**
 * Creates a campaign brief with its budget and schedule.
 *
 * @throws `invalid_state` for an invalid budget, nonfinite timestamps,
 * or an end before the start.
 */
export async function createCampaign(
  ctx: MutationCtx,
  campaign: WithoutSystemFields<Doc<"campaigns">>,
): Promise<Id<"campaigns">> {
  if (!Number.isSafeInteger(campaign.budgetCents) || campaign.budgetCents < 0) {
    throw apiError("invalid_state", { reason: "invalid_budget" });
  }
  if (
    !Number.isFinite(campaign.startsAt) ||
    (campaign.endsAt !== undefined && !Number.isFinite(campaign.endsAt))
  ) {
    throw apiError("invalid_state", { reason: "invalid_schedule" });
  }
  if (campaign.endsAt !== undefined && campaign.endsAt < campaign.startsAt) {
    throw apiError("invalid_state", { reason: "end_before_start" });
  }

  return await ctx.db.insert("campaigns", campaign);
}
