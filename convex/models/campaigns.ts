import type { PaginationOptions, PaginationResult, WithoutSystemFields } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";
import schema from "../schema";

export const campaignUpdate = schema
  .doc("campaigns")
  .pick("title", "objective", "product", "audience", "description", "budgetCents", "startsAt")
  .partial()
  .extend({ endsAt: v.optional(v.union(v.number(), v.null())) });

export type CampaignUpdate = Infer<typeof campaignUpdate>;

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

/** Updates campaign details while keeping child deadlines within its end and preserving agreed terms. */
export async function updateCampaign(
  ctx: MutationCtx,
  campaignId: Id<"campaigns">,
  companyId: Id<"companies">,
  fields: CampaignUpdate,
): Promise<void> {
  const campaign = await requireCampaign(ctx, campaignId, companyId);
  const patch: Partial<Pick<Doc<"campaigns">, keyof CampaignUpdate>> = {};

  for (const field of ["title", "objective", "product", "audience", "description"] as const) {
    const value = fields[field];
    if (value !== undefined) {
      patch[field] = requireNonBlank(value, `campaign_${field}`);
    }
  }
  if (fields.budgetCents !== undefined) {
    patch.budgetCents = fields.budgetCents;
  }
  if (fields.startsAt !== undefined) {
    patch.startsAt = fields.startsAt;
  }
  if (fields.endsAt !== undefined) {
    patch.endsAt = fields.endsAt ?? undefined;
  }

  validateCampaignBudgetAndSchedule({ ...campaign, ...patch });
  const endsAt = fields.endsAt;
  if (typeof endsAt === "number" && endsAt !== campaign.endsAt) {
    const opportunity = await ctx.db
      .query("opportunities")
      .withIndex("by_campaignId_and_deadline", (q) =>
        q.eq("campaignId", campaignId).gt("deadline", endsAt),
      )
      .first();
    if (opportunity !== null) {
      throw apiError("invalid_state", { reason: "end_before_opportunity_deadline" });
    }
  }
  await ctx.db.patch("campaigns", campaignId, patch);
}

/** Removes only a draft with no opportunities, preserving campaigns that have been used. */
export async function removeCampaign(
  ctx: MutationCtx,
  campaignId: Id<"campaigns">,
  companyId: Id<"companies">,
): Promise<void> {
  const campaign = await requireCampaign(ctx, campaignId, companyId);
  if (campaign.status !== "draft") {
    throw apiError("invalid_state", { reason: "campaign_not_draft" });
  }

  const opportunity = await ctx.db
    .query("opportunities")
    .withIndex("by_campaignId_and_status", (q) => q.eq("campaignId", campaignId))
    .first();
  if (opportunity !== null) {
    throw apiError("invalid_state", { reason: "campaign_has_opportunities" });
  }

  await ctx.db.delete("campaigns", campaignId);
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
  validateCampaignBudgetAndSchedule(campaign);

  return await ctx.db.insert("campaigns", {
    ...campaign,
    title: requireNonBlank(campaign.title, "campaign_title"),
    objective: requireNonBlank(campaign.objective, "campaign_objective"),
    product: requireNonBlank(campaign.product, "campaign_product"),
    audience: requireNonBlank(campaign.audience, "campaign_audience"),
    description: requireNonBlank(campaign.description, "campaign_description"),
  });
}

function validateCampaignBudgetAndSchedule(
  campaign: Pick<Doc<"campaigns">, "budgetCents" | "startsAt" | "endsAt">,
): void {
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
}
