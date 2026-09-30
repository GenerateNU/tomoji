import type { PaginationOptions, PaginationResult, WithoutSystemFields } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";

/** Returns a campaign, or throws `not_found` if it is missing or belongs to another company. */
export async function requireCampaign(
  ctx: QueryCtx | MutationCtx,
  campaignId: Id<"campaigns">,
  companyId: Id<"companies">,
): Promise<Doc<"campaigns">> {
  const campaign = await ctx.db.get("campaigns", campaignId);
  if (campaign === null || campaign.companyId !== companyId) {
    throw apiError("not_found", { campaignId });
  }
  return campaign;
}

/** Returns one page of a company's campaigns, newest first, optionally filtered by status. */
export async function listCampaigns(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  options: { status?: Doc<"campaigns">["status"]; paginationOpts: PaginationOptions },
): Promise<PaginationResult<Doc<"campaigns">>> {
  const status = options.status;
  const campaigns =
    status === undefined
      ? ctx.db.query("campaigns").withIndex("by_companyId", (q) => q.eq("companyId", companyId))
      : ctx.db
          .query("campaigns")
          .withIndex("by_companyId_and_status", (q) =>
            q.eq("companyId", companyId).eq("status", status),
          );

  return await campaigns.order("desc").paginate(options.paginationOpts);
}

/**
 * Creates a draft or open campaign with a trimmed, nonblank brief.
 *
 * @throws `invalid_state` for blank brief fields, an invalid initial status or budget,
 * nonfinite timestamps, or an end that is not after the start.
 */
export async function createCampaign(
  ctx: MutationCtx,
  campaign: WithoutSystemFields<Doc<"campaigns">>,
): Promise<Id<"campaigns">> {
  if (campaign.status !== "draft" && campaign.status !== "open") {
    throw apiError("invalid_state", { reason: "invalid_status" });
  }
  if (!Number.isSafeInteger(campaign.budgetCents) || campaign.budgetCents < 0) {
    throw apiError("invalid_state", { reason: "invalid_budget" });
  }
  if (
    !Number.isFinite(campaign.startsAt) ||
    (campaign.endsAt !== undefined && !Number.isFinite(campaign.endsAt))
  ) {
    throw apiError("invalid_state", { reason: "invalid_schedule" });
  }
  if (campaign.endsAt !== undefined && campaign.endsAt <= campaign.startsAt) {
    throw apiError("invalid_state", { reason: "end_not_after_start" });
  }

  return await ctx.db.insert("campaigns", {
    ...campaign,
    title: requireNonBlank(campaign.title, "campaign_title"),
    objective: requireNonBlank(campaign.objective, "campaign_objective"),
    product: requireNonBlank(campaign.product, "campaign_product"),
    audience: requireNonBlank(campaign.audience, "campaign_audience"),
    description: requireNonBlank(campaign.description, "campaign_description"),
  });
}
