import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";
import schema from "../schema";

export const opportunityCreate = schema
  .doc("opportunities")
  .omit("_id", "_creationTime", "companyId", "createdBy", "numFilledSlots", "status")
  .extend({ status: v.union(v.literal("draft"), v.literal("open")) });

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
  if (fields.maxApplications > fields.maxSlots) {
    throw apiError("invalid_state", { reason: "invalid_capacity", field: "maxApplications" });
  }
  if (
    !Number.isSafeInteger(fields.deadline) ||
    (fields.status === "open" && fields.deadline <= Date.now())
  ) {
    throw apiError("invalid_state", { reason: "invalid_deadline" });
  }
  if (campaign.endsAt !== undefined && fields.deadline > campaign.endsAt) {
    throw apiError("invalid_state", { reason: "deadline_after_campaign_end" });
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
