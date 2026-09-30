import type { PaginationOptions, PaginationResult } from "convex/server";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import type { applicationStatus } from "../schemas/applications.schema";

/**
 * Creates a pending application from a creator to an open, gated opportunity.
 *
 * @throws `not_found` if the opportunity does not exist.
 * The note is optional; a missing or blank note is left out.
 *
 * @throws `invalid_state` if the opportunity is not open or ungated, or it
 * already has `maxApplications` applications.
 * @throws `conflict` if the creator has already applied.
 */
export async function createApplication(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  args: { opportunityId: Id<"opportunities">; note?: string },
): Promise<Id<"applications">> {
  const note = args.note?.trim() || undefined;
  const opportunity = await ctx.db.get("opportunities", args.opportunityId);
  if (opportunity === null) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  await requireOpportunityOpen(ctx, opportunity);
  // Ungated opportunities are joined directly, without an application.
  if (!opportunity.isGated) {
    throw apiError("invalid_state", { reason: "opportunity_not_gated" });
  }
  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  if (campaign === null) {
    throw apiError("not_found", { resource: "opportunity" });
  }

  // One application per creator per opportunity: blocks double-submits and
  // retries, which the non-unique index cannot prevent on its own.
  const existing = await ctx.db
    .query("applications")
    .withIndex("by_opportunityId_and_creatorId", (q) =>
      q.eq("opportunityId", args.opportunityId).eq("creatorId", creatorId),
    )
    .first();
  if (existing !== null) {
    throw apiError("conflict", { reason: "already_applied" });
  }

  // Every application counts toward the cap, whatever its status. Reads at most
  // maxApplications rows; concurrent applies read the same range, so Convex
  // retries one and the cap cannot be exceeded.
  const received = await ctx.db
    .query("applications")
    .withIndex("by_opportunityId_and_status", (q) => q.eq("opportunityId", opportunity._id))
    .take(opportunity.maxApplications);
  if (received.length >= opportunity.maxApplications) {
    throw apiError("invalid_state", { reason: "applications_full" });
  }

  return await ctx.db.insert("applications", {
    opportunityId: opportunity._id,
    creatorId,
    companyId: campaign.companyId,
    note,
    status: "pending",
  });
}

/**
 * Requires the opportunity and its campaign to be open. While either is paused
 * or closed, only creators may act on existing offers, so applying, offering,
 * and rejecting are all refused.
 *
 * @throws `invalid_state` with `opportunity_not_open` or `campaign_not_open`.
 */
async function requireOpportunityOpen(
  ctx: QueryCtx | MutationCtx,
  opportunity: Doc<"opportunities">,
): Promise<void> {
  if (opportunity.status !== "open") {
    throw apiError("invalid_state", { reason: "opportunity_not_open" });
  }
  // Pausing a campaign pauses its opportunities, so check the campaign too.
  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  if (campaign === null || campaign.status !== "open") {
    throw apiError("invalid_state", { reason: "campaign_not_open" });
  }
}

/** Who is reading an application, resolved from the caller by the route. */
export type ApplicationViewer =
  | { role: "operator" }
  | { role: "creator"; creatorId: Id<"creators"> }
  | { role: "company"; companyId: Id<"companies"> };

/**
 * Returns an application the viewer may see: creators see their own, company
 * users see applications to their company's opportunities, and operators see
 * all.
 *
 * @throws `not_found` if the application does not exist or the viewer may not
 * see it, so callers cannot probe for other applications.
 */
export async function requireApplication(
  ctx: QueryCtx | MutationCtx,
  viewer: ApplicationViewer,
  applicationId: Id<"applications">,
): Promise<Doc<"applications">> {
  const application = await ctx.db.get("applications", applicationId);
  if (application === null || !canViewApplication(viewer, application)) {
    throw apiError("not_found", { resource: "application" });
  }
  return application;
}

function canViewApplication(viewer: ApplicationViewer, application: Doc<"applications">): boolean {
  switch (viewer.role) {
    case "operator":
      return true;
    case "creator":
      return application.creatorId === viewer.creatorId;
    case "company":
      return application.companyId === viewer.companyId;
  }
}

/**
 * Returns one page of a creator's applications, optionally filtered by status.
 * Results are ordered by status, then newest first within each status.
 */
export async function listApplications(
  ctx: QueryCtx,
  options: {
    creatorId: Id<"creators">;
    status?: Infer<typeof applicationStatus>;
    paginationOpts: PaginationOptions;
  },
): Promise<PaginationResult<Doc<"applications">>> {
  const { creatorId, status } = options;
  return await ctx.db
    .query("applications")
    .withIndex("by_creatorId_and_status", (q) =>
      status === undefined
        ? q.eq("creatorId", creatorId)
        : q.eq("creatorId", creatorId).eq("status", status),
    )
    .order("desc")
    .paginate(options.paginationOpts);
}

/**
 * Returns one page of applications to an opportunity the company owns,
 * optionally filtered by status. Results are ordered by status, then newest
 * first within each status.
 *
 * @throws `not_found` if the opportunity does not exist or belongs to another
 * company.
 */
export async function listApplicationsByOpportunityId(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  options: {
    opportunityId: Id<"opportunities">;
    status?: Infer<typeof applicationStatus>;
    paginationOpts: PaginationOptions;
  },
): Promise<PaginationResult<Doc<"applications">>> {
  const { opportunityId, status } = options;
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  const campaign = opportunity && (await ctx.db.get("campaigns", opportunity.campaignId));
  if (!campaign || campaign.companyId !== companyId) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  return await ctx.db
    .query("applications")
    .withIndex("by_opportunityId_and_status", (q) =>
      status === undefined
        ? q.eq("opportunityId", opportunityId)
        : q.eq("opportunityId", opportunityId).eq("status", status),
    )
    .order("desc")
    .paginate(options.paginationOpts);
}

/** How long an offer stays open when the company does not choose an expiry. */
export const DEFAULT_OFFER_DURATION_MS = 48 * 60 * 60 * 1000;

/**
 * Sends an offer on a pending application to one of the company's
 * opportunities. Offers are not capped by open slots: the first creators to
 * accept take them.
 *
 * @throws `not_found` if the application does not exist or belongs to another
 * company.
 * @throws `invalid_state` if the application is not pending, the opportunity or
 * its campaign is not open, or `offerExpiresAt` is not in the future.
 */
export async function offerApplication(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  applicationId: Id<"applications">,
  args: { offerExpiresAt?: number },
): Promise<Doc<"applications">> {
  const application = await requirePendingForReview(ctx, companyId, applicationId);
  const now = Date.now();
  const offerExpiresAt = args.offerExpiresAt ?? now + DEFAULT_OFFER_DURATION_MS;
  if (!Number.isFinite(offerExpiresAt) || offerExpiresAt <= now) {
    throw apiError("invalid_state", { reason: "invalid_offer_expiry" });
  }

  const patch = { status: "offered" as const, offerSentAt: now, offerExpiresAt };
  await ctx.db.patch("applications", application._id, patch);
  return { ...application, ...patch };
}

/**
 * Rejects a pending application to one of the company's opportunities.
 *
 * @throws `not_found` if the application does not exist or belongs to another
 * company.
 * @throws `invalid_state` if the application is not pending or the opportunity
 * or its campaign is not open.
 */
export async function rejectApplication(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  applicationId: Id<"applications">,
): Promise<Doc<"applications">> {
  const application = await requirePendingForReview(ctx, companyId, applicationId);
  await ctx.db.patch("applications", application._id, { status: "rejected" });
  return { ...application, status: "rejected" };
}

/** Loads a pending application the company may review while it is open. */
async function requirePendingForReview(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  applicationId: Id<"applications">,
): Promise<Doc<"applications">> {
  const application = await requireApplication(ctx, { role: "company", companyId }, applicationId);
  if (application.status !== "pending") {
    throw apiError("invalid_state", { reason: "application_not_pending" });
  }
  const opportunity = await ctx.db.get("opportunities", application.opportunityId);
  if (opportunity === null) {
    throw apiError("not_found", { resource: "application" });
  }
  await requireOpportunityOpen(ctx, opportunity);
  return application;
}
