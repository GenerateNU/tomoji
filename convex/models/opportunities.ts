import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";
import { requireMembership } from "./companyUsers";
import schema from "../schema";

export const opportunityCreate = schema
  .doc("opportunities")
  .omit("_id", "_creationTime", "companyId", "createdBy", "numFilledSlots");

export type OpportunityCreate = Infer<typeof opportunityCreate>;

/** Creates a draft or open opportunity in the caller's campaign; ownership is server-derived. */
export async function createOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  fields: OpportunityCreate,
): Promise<Id<"opportunities">> {
  const campaign = await ctx.db.get("campaigns", fields.campaignId);
  if (campaign === null || campaign.companyId !== membership.companyId) {
    throw apiError("not_found", { resource: "campaign" });
  }
  const company = await ctx.db.get("companies", campaign.companyId);
  if (company === null || !company.isActive) {
    throw apiError("not_found", { resource: "campaign" });
  }
  if (fields.status !== "draft" && fields.status !== "open") {
    throw apiError("invalid_state", { reason: "invalid_status" });
  }
  if (campaign.status === "closed" || (fields.status === "open" && campaign.status !== "open")) {
    throw apiError("invalid_state", { reason: "campaign_not_open" });
  }
  const title = requireNonBlank(fields.title, "title");
  const description = requireNonBlank(fields.description, "description");
  for (const field of ["fixedFeeCents", "cpmRateCents", "paymentCapCents"] as const) {
    if (!Number.isSafeInteger(fields[field]) || fields[field] < 0) {
      throw apiError("invalid_state", { reason: "invalid_compensation", field });
    }
  }
  for (const field of ["maxSlots", "maxApplications"] as const) {
    if (!Number.isSafeInteger(fields[field]) || fields[field] <= 0) {
      throw apiError("invalid_state", { reason: "invalid_capacity", field });
    }
  }
  if (
    !Number.isFinite(fields.deadline) ||
    (fields.status === "open" && fields.deadline <= Date.now())
  ) {
    throw apiError("invalid_state", { reason: "invalid_deadline" });
  }
  return await ctx.db.insert("opportunities", {
    ...fields,
    title,
    description,
    companyId: campaign.companyId,
    createdBy: membership._id,
    numFilledSlots: 0,
  });
}

/** Returns an opportunity visible to its company, a creator, or an operator. */
export async function requireOpportunity(
  ctx: QueryCtx | MutationCtx,
  opportunityId: Id<"opportunities">,
  caller: { user: Doc<"users">; orgId: string | null },
): Promise<Doc<"opportunities">> {
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  if (opportunity === null) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  if (caller.user.role === "operator") return opportunity;

  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  if (campaign === null || campaign.companyId !== opportunity.companyId) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  if (caller.user.role === "company") {
    if (caller.orgId === null) {
      throw apiError("misconfigured", { reason: "company account has no organization" });
    }
    const membership = await requireMembership(ctx, caller.user._id, caller.orgId);
    if (membership.companyId !== opportunity.companyId) {
      throw apiError("not_found", { resource: "opportunity" });
    }
    return opportunity;
  }

  const company = await ctx.db.get("companies", opportunity.companyId);
  if (
    opportunity.status !== "open" ||
    campaign.status !== "open" ||
    company === null ||
    !company.isActive
  ) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  return opportunity;
}
