import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { apiError } from "../lib/errors";

/**
 * Creates a creator's assignment on an open, ungated opportunity.
 *
 * @throws `not_found` if the opportunity does not exist or its company is
 * inactive.
 * @throws `invalid_state` if the opportunity or its campaign is not open, the
 * deadline has passed, the opportunity is gated, or no slots remain.
 * @throws `conflict` if the creator already has an assignment on it.
 */
export async function claimAssignment(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  opportunityId: Id<"opportunities">,
): Promise<Id<"assignments">> {
  const { opportunity, campaign } = await requireOpportunityWithCampaign(ctx, opportunityId);
  const company = await ctx.db.get("companies", campaign.companyId);
  if (company === null || !company.isActive) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  if (opportunity.status !== "open") {
    throw apiError("invalid_state", { reason: "opportunity_not_open" });
  }
  if (campaign.status !== "open") {
    throw apiError("invalid_state", { reason: "campaign_not_open" });
  }
  // The deadline cron may not have closed the opportunity yet.
  if (opportunity.deadline <= Date.now()) {
    throw apiError("invalid_state", { reason: "opportunity_expired" });
  }
  // Gated opportunities are joined by accepting an offer on an application.
  if (opportunity.isGated) {
    throw apiError("invalid_state", { reason: "opportunity_gated" });
  }
  return await createAssignment(ctx, opportunity, campaign, creatorId);
}

/**
 * Creates the assignment for a creator who accepted an offer on a gated
 * opportunity. Call it in the same mutation that marks the application
 * accepted; it does not read or check the application. Offers can be accepted
 * while the opportunity or campaign is paused.
 *
 * @throws `not_found` if the opportunity does not exist.
 * @throws `invalid_state` if the opportunity is a draft or closed, is ungated,
 * or has no slots left.
 * @throws `conflict` if the creator already has an assignment on it.
 */
export async function createAssignmentFromOffer(
  ctx: MutationCtx,
  args: { opportunityId: Id<"opportunities">; creatorId: Id<"creators"> },
): Promise<Id<"assignments">> {
  const { opportunity, campaign } = await requireOpportunityWithCampaign(ctx, args.opportunityId);
  if (opportunity.status !== "open" && opportunity.status !== "paused") {
    throw apiError("invalid_state", { reason: "opportunity_closed" });
  }
  if (!opportunity.isGated) {
    throw apiError("invalid_state", { reason: "opportunity_not_gated" });
  }
  return await createAssignment(ctx, opportunity, campaign, args.creatorId);
}

async function requireOpportunityWithCampaign(
  ctx: MutationCtx,
  opportunityId: Id<"opportunities">,
): Promise<{ opportunity: Doc<"opportunities">; campaign: Doc<"campaigns"> }> {
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  const campaign = opportunity && (await ctx.db.get("campaigns", opportunity.campaignId));
  if (!opportunity || !campaign) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  return { opportunity, campaign };
}

/**
 * Takes a slot and inserts a termsPending assignment with the opportunity's
 * current terms, so later opportunity edits do not change the deal.
 *
 * The slot check and increment read and write the opportunity in this
 * transaction, so when two creators race for the last slot Convex retries the
 * later one against the updated count and it fails as full.
 */
async function createAssignment(
  ctx: MutationCtx,
  opportunity: Doc<"opportunities">,
  campaign: Doc<"campaigns">,
  creatorId: Id<"creators">,
): Promise<Id<"assignments">> {
  // One assignment per creator per opportunity, whatever its status. The index
  // is not unique, so this check is what blocks double claims and retries.
  const existing = await ctx.db
    .query("assignments")
    .withIndex("by_opportunityId_and_creatorId", (q) =>
      q.eq("opportunityId", opportunity._id).eq("creatorId", creatorId),
    )
    .first();
  if (existing !== null) {
    throw apiError("conflict", { reason: "already_assigned" });
  }
  if (opportunity.numFilledSlots >= opportunity.maxSlots) {
    throw apiError("invalid_state", { reason: "opportunity_full" });
  }

  const assignmentId = await ctx.db.insert("assignments", {
    opportunityId: opportunity._id,
    creatorId,
    companyId: campaign.companyId,
    fixedFeeCents: opportunity.fixedFeeCents,
    cpmRateCents: opportunity.cpmRateCents,
    paymentCapCents: opportunity.paymentCapCents,
    usesAiReview: opportunity.usesAiReviewDefault,
    status: "termsPending",
  });
  await ctx.db.patch("opportunities", opportunity._id, {
    numFilledSlots: opportunity.numFilledSlots + 1,
  });
  return assignmentId;
}
