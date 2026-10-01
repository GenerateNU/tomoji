import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";
import { requireMembership } from "./companyUsers";
import schema from "../schema";

export const opportunityCreate = schema
  .doc("opportunities")
  .omit("_id", "_creationTime", "companyId", "createdBy", "numFilledSlots", "status")
  .extend({ status: v.union(v.literal("draft"), v.literal("open")) });

export type OpportunityCreate = Infer<typeof opportunityCreate>;

// Allowlist creator fields so new stored fields do not become public by default.
export const creatorOpportunity = schema
  .doc("opportunities")
  .pick(
    "_id",
    "_creationTime",
    "title",
    "description",
    "isGated",
    "usesAiReviewDefault",
    "targetApplicant",
    "maxSlots",
    "numFilledSlots",
    "maxApplications",
    "deadline",
    "status",
    "fixedFeeCents",
    "cpmRateCents",
    "paymentCapCents",
    "contentRequirements",
    "prohibitedClaims",
    "disclosureRequirements",
    "usageRights",
  )
  .extend({ companyName: v.string() });

export type CreatorOpportunity = Infer<typeof creatorOpportunity>;

/** Builds the allowlisted creator-facing brief from an opportunity and its company. */
export function toCreatorOpportunity(
  opportunity: Doc<"opportunities">,
  company: Doc<"companies">,
): CreatorOpportunity {
  return {
    _id: opportunity._id,
    _creationTime: opportunity._creationTime,
    title: opportunity.title,
    description: opportunity.description,
    isGated: opportunity.isGated,
    usesAiReviewDefault: opportunity.usesAiReviewDefault,
    targetApplicant: opportunity.targetApplicant,
    maxSlots: opportunity.maxSlots,
    numFilledSlots: opportunity.numFilledSlots,
    maxApplications: opportunity.maxApplications,
    deadline: opportunity.deadline,
    status: opportunity.status,
    fixedFeeCents: opportunity.fixedFeeCents,
    cpmRateCents: opportunity.cpmRateCents,
    paymentCapCents: opportunity.paymentCapCents,
    contentRequirements: opportunity.contentRequirements,
    prohibitedClaims: opportunity.prohibitedClaims,
    disclosureRequirements: opportunity.disclosureRequirements,
    usageRights: opportunity.usageRights,
    companyName: company.name,
  };
}

/** Returns a role-appropriate opportunity response after enforcing visibility. */
export async function getOpportunity(
  ctx: QueryCtx,
  opportunityId: Id<"opportunities">,
  caller: { user: Doc<"users">; orgId: string | null },
): Promise<Doc<"opportunities"> | CreatorOpportunity> {
  const opportunity = await requireOpportunity(ctx, opportunityId, caller);
  if (caller.user.role === "company" || caller.user.role === "operator") return opportunity;

  const company = await ctx.db.get("companies", opportunity.companyId);
  if (company === null) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  return toCreatorOpportunity(opportunity, company);
}

export const opportunityUpdate = opportunityCreate
  .omit("campaignId", "status", "productAccessLink")
  .partial()
  .extend({
    productAccessLink: v.optional(v.union(v.string(), v.null())),
  });

export type OpportunityUpdate = Infer<typeof opportunityUpdate>;

/** Requires an exact UTC :00 or :30 deadline with zero seconds and milliseconds. */
function validateOpportunityDeadline(deadline: number): void {
  if (!Number.isSafeInteger(deadline) || deadline % (30 * 60 * 1000) !== 0) {
    throw apiError("invalid_state", { reason: "invalid_deadline" });
  }
}

/** Applies the shared, idempotent close transition without rewriting workflow records. */
async function applyOpportunityClose(
  ctx: MutationCtx,
  opportunity: Doc<"opportunities">,
): Promise<Doc<"opportunities">> {
  if (opportunity.status === "closed") return opportunity;
  await ctx.db.patch("opportunities", opportunity._id, { status: "closed" });
  return { ...opportunity, status: "closed" };
}

/** Permanently closes an owned published opportunity, preserving existing commitments. */
export async function closeOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
): Promise<Doc<"opportunities">> {
  const { opportunity } = await requireOwnedOpportunity(ctx, membership, opportunityId);
  if (opportunity.status === "draft") {
    throw apiError("invalid_state", { reason: "opportunity_not_published" });
  }
  return await applyOpportunityClose(ctx, opportunity);
}

/** Closes a bounded batch of overdue published opportunities and reports whether more may remain. */
export async function closeExpiredOpportunities(ctx: MutationCtx): Promise<boolean> {
  const now = Date.now();
  const batchSize = 50;
  let hasMore = false;
  for (const status of ["open", "paused"] as const) {
    const opportunities = await ctx.db
      .query("opportunities")
      .withIndex("by_status_and_deadline", (q) => q.eq("status", status).lte("deadline", now))
      .take(batchSize);
    for (const opportunity of opportunities) await applyOpportunityClose(ctx, opportunity);
    hasMore ||= opportunities.length === batchSize;
  }
  return hasMore;
}

/** Loads an owned opportunity and its campaign for company lifecycle transitions. */
async function requireOwnedOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
): Promise<{ opportunity: Doc<"opportunities">; campaign: Doc<"campaigns"> }> {
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  if (opportunity === null || opportunity.companyId !== membership.companyId) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  const company = await ctx.db.get("companies", opportunity.companyId);
  if (
    campaign === null ||
    campaign.companyId !== opportunity.companyId ||
    company === null ||
    !company.isActive
  ) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  return { opportunity, campaign };
}

/** Pauses an owned open opportunity without changing its existing workflow records. */
export async function pauseOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
): Promise<Doc<"opportunities">> {
  const { opportunity, campaign } = await requireOwnedOpportunity(ctx, membership, opportunityId);
  if (opportunity.status !== "open") {
    throw apiError("invalid_state", { reason: "opportunity_not_open" });
  }
  if (campaign.status === "closed") {
    throw apiError("invalid_state", { reason: "campaign_closed" });
  }
  await ctx.db.patch("opportunities", opportunityId, { status: "paused" });
  return { ...opportunity, status: "paused" };
}

/** Resumes an owned paused opportunity without altering its campaign or agreed terms. */
export async function resumeOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
): Promise<Doc<"opportunities">> {
  const { opportunity, campaign } = await requireOwnedOpportunity(ctx, membership, opportunityId);
  if (opportunity.status !== "paused") {
    throw apiError("invalid_state", { reason: "opportunity_not_paused" });
  }
  // Campaign and opportunity pause state are independent; resuming one cannot resume the other.
  if (campaign.status !== "open") {
    throw apiError("invalid_state", { reason: "campaign_not_open" });
  }
  validateOpportunityDeadline(opportunity.deadline);
  if (opportunity.deadline <= Date.now()) {
    throw apiError("invalid_state", { reason: "invalid_deadline" });
  }
  await ctx.db.patch("opportunities", opportunityId, { status: "open" });
  return { ...opportunity, status: "open" };
}

/** Publishes an owned draft after validating its brief and parent campaign. */
export async function publishOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
): Promise<Doc<"opportunities">> {
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  if (opportunity === null || opportunity.companyId !== membership.companyId) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  const company = await ctx.db.get("companies", opportunity.companyId);
  if (
    campaign === null ||
    campaign.companyId !== opportunity.companyId ||
    company === null ||
    !company.isActive
  ) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  if (opportunity.status !== "draft") {
    throw apiError("invalid_state", { reason: "opportunity_not_draft" });
  }
  if (campaign.status !== "open") {
    throw apiError("invalid_state", { reason: "campaign_not_open" });
  }
  // Validate the target state so a deadline allowed on a draft must still be future at publication.
  const normalized = validateOpportunityFields({ ...opportunity, status: "open" });
  if (campaign.endsAt !== undefined && opportunity.deadline > campaign.endsAt) {
    throw apiError("invalid_state", { reason: "deadline_after_campaign_end" });
  }
  await ctx.db.patch("opportunities", opportunityId, { status: "open", ...normalized });
  return { ...opportunity, status: "open", ...normalized };
}

/** Removes an owned, unused draft without cascading into workflow history. */
export async function removeOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
): Promise<void> {
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  if (opportunity === null || opportunity.companyId !== membership.companyId) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  const company = await ctx.db.get("companies", opportunity.companyId);
  if (
    campaign === null ||
    campaign.companyId !== opportunity.companyId ||
    company === null ||
    !company.isActive
  ) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  if (opportunity.status !== "draft" || opportunity.numFilledSlots !== 0) {
    throw apiError("invalid_state", { reason: "opportunity_not_removable" });
  }
  // Check all statuses: historical applications and assignments must not become orphaned.
  const applications = await ctx.db
    .query("applications")
    .withIndex("by_opportunityId_and_status", (q) => q.eq("opportunityId", opportunityId))
    .take(1);
  const assignments = await ctx.db
    .query("assignments")
    .withIndex("by_opportunityId_and_status", (q) => q.eq("opportunityId", opportunityId))
    .take(1);
  if (applications.length > 0 || assignments.length > 0) {
    throw apiError("invalid_state", { reason: "opportunity_has_workflow_history" });
  }
  await ctx.db.delete("opportunities", opportunityId);
}

/** Updates an owned brief and its defaults without changing existing assignment terms. */
export async function updateOpportunity(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  opportunityId: Id<"opportunities">,
  updates: OpportunityUpdate,
): Promise<Doc<"opportunities">> {
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  if (opportunity === null || opportunity.companyId !== membership.companyId) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  const company = await ctx.db.get("companies", opportunity.companyId);
  if (
    campaign === null ||
    campaign.companyId !== opportunity.companyId ||
    company === null ||
    !company.isActive
  ) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  if (opportunity.status === "closed" || campaign.status === "closed") {
    throw apiError("invalid_state", { reason: "opportunity_not_editable" });
  }
  // Deadline closure is permanent even during the interval before the cron materializes it.
  if (opportunity.status !== "draft" && opportunity.deadline <= Date.now()) {
    throw apiError("invalid_state", { reason: "opportunity_expired" });
  }

  const patch: Partial<OpportunityCreate> = {};
  for (const field of [
    "title",
    "description",
    "targetApplicant",
    "contentRequirements",
    "prohibitedClaims",
    "disclosureRequirements",
    "usageRights",
  ] as const) {
    if (updates[field] !== undefined) patch[field] = updates[field];
  }
  for (const field of [
    "maxSlots",
    "maxApplications",
    "deadline",
    "fixedFeeCents",
    "cpmRateCents",
    "paymentCapCents",
  ] as const) {
    if (updates[field] !== undefined) patch[field] = updates[field];
  }
  for (const field of ["isGated", "usesAiReviewDefault"] as const) {
    if (updates[field] !== undefined) patch[field] = updates[field];
  }
  // Omitted fields stay unchanged; null removes the optional link, as in creator updates.
  if (updates.productAccessLink !== undefined)
    patch.productAccessLink = updates.productAccessLink ?? undefined;
  const updated = { ...opportunity, ...patch };
  const normalized = validateOpportunityFields(updated);
  if (campaign.endsAt !== undefined && updated.deadline > campaign.endsAt) {
    throw apiError("invalid_state", { reason: "deadline_after_campaign_end" });
  }
  if (updated.maxSlots < opportunity.numFilledSlots) {
    throw apiError("invalid_state", { reason: "capacity_below_filled_slots" });
  }
  if (
    updates.deadline !== undefined &&
    opportunity.status !== "draft" &&
    updates.deadline <= Date.now()
  ) {
    throw apiError("invalid_state", { reason: "invalid_deadline" });
  }

  await ctx.db.patch("opportunities", opportunityId, { ...patch, ...normalized });
  return { ...updated, ...normalized };
}

export const opportunityList = schema
  .doc("opportunities")
  .pick("campaignId", "status")
  .partial()
  .extend({
    paginationOpts: paginationOptsValidator,
  });

export const opportunityDiscover = opportunityList.pick("paginationOpts");

/** Discovers open briefs across active companies without ranking or application eligibility rules. */
export async function discoverOpportunities(
  ctx: QueryCtx,
  options: Infer<typeof opportunityDiscover>,
): Promise<PaginationResult<CreatorOpportunity>> {
  const result = await ctx.db
    .query("opportunities")
    .withIndex("by_status_and_deadline", (q) => q.eq("status", "open"))
    .paginate(options.paginationOpts);
  const visible = await Promise.all(
    result.page.map(async (opportunity) => {
      const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
      if (
        campaign === null ||
        campaign.status !== "open" ||
        campaign.companyId !== opportunity.companyId
      ) {
        return null;
      }
      const company = await ctx.db.get("companies", opportunity.companyId);
      return company !== null && company.isActive
        ? toCreatorOpportunity(opportunity, company)
        : null;
    }),
  );

  // Visibility can shorten a page; retain the native cursor and isDone so callers can continue.
  return { ...result, page: visible.filter((opportunity) => opportunity !== null) };
}

/** Lists the company's opportunities, optionally scoped to an owned campaign and status. */
export async function listOpportunities(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  options: Infer<typeof opportunityList>,
): Promise<PaginationResult<Doc<"opportunities">>> {
  const { campaignId, status } = options;
  if (campaignId !== undefined) {
    const campaign = await ctx.db.get("campaigns", campaignId);
    if (campaign === null || campaign.companyId !== companyId) {
      throw apiError("not_found", { resource: "campaign" });
    }
    return await ctx.db
      .query("opportunities")
      .withIndex("by_campaignId_and_status", (q) => {
        const range = q.eq("campaignId", campaignId);
        return status === undefined ? range : range.eq("status", status);
      })
      .paginate(options.paginationOpts);
  }
  return await ctx.db
    .query("opportunities")
    .withIndex("by_companyId_and_status", (q) => {
      const range = q.eq("companyId", companyId);
      return status === undefined ? range : range.eq("status", status);
    })
    .paginate(options.paginationOpts);
}

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
  const { title, description } = validateOpportunityFields(fields);
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

/** Validates shared write bounds and returns the normalized brief text. */
function validateOpportunityFields(
  fields: Omit<OpportunityCreate, "status"> & Pick<Doc<"opportunities">, "status">,
): {
  title: string;
  description: string;
} {
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
  validateOpportunityDeadline(fields.deadline);
  if (fields.status === "open" && fields.deadline <= Date.now()) {
    throw apiError("invalid_state", { reason: "invalid_deadline" });
  }
  return { title, description };
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
