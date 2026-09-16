import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Every campaign a company is currently accepting applications - it is open
 * and the deadline has not yet passed
 *
 * @param ctx the service containing database query functions
 * @param companyId the id of the company whose active campaigns are being fetched
 * @param startDatetime the date and time that the deadline must be after
 *
 * @return 
 */
export async function getAllActiveCompanyCampaigns(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  startDatetime: number,
): Promise<Doc<"campaigns">[]> {
  return await ctx.db
    .query("campaigns")
    .withIndex("by_company_status_and_deadline", (q) =>
      q.eq("companyId", companyId).eq("status", "open").gt("deadline", startDatetime),
    )
    .collect();
}

/**
 * Creates a campaign and returns its id.
 *
 * @param ctx service for convex mutation functions
 * @param campaign the campaign object with at least all required fields
 *
 * @return the campaignId of the new campaign
 */
export async function insertCompanyCampaign(
  ctx: MutationCtx,
  campaign: WithoutSystemFields<Doc<"campaigns">>,
): Promise<Id<"campaigns">> {
  if (campaign.deadline < Date.now()) {
    throw new Error("Deadline must be in the future")
  }
  if (campaign.maxOpenings <= 0) {
    throw new Error("Max Openings must be greater than 0");
  }
  if (campaign.maxApplications <= campaign.maxOpenings) {
    throw new Error("Max Applications must be greater than Max Openings");
  }
  return await ctx.db.insert("campaigns", campaign);
}
