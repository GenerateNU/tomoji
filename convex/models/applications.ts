import type { PaginationOptions, PaginationResult } from "convex/server";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import type { applicationStatus } from "../schemas/applications.schema";
import { createAssignmentFromOffer } from "./assignments";

/**
 * Creates a pending application from a creator to an open, gated opportunity.
 *
 * @throws `not_found` if the opportunity does not exist.
 * The note is optional; a missing or blank note is left out.
 *
 * @throws `invalid_state` if the opportunity or its campaign is not open, the
 * opportunity is ungated, or it already has `maxApplications` applications.
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
  const campaign = await requireOpportunityOpen(ctx, opportunity);
  // Ungated opportunities are joined directly, without an application.
  if (!opportunity.isGated) {
    throw apiError("invalid_state", { reason: "opportunity_not_gated" });
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
 * Requires the opportunity and its campaign to be open. While paused or closed,
 * only creators may act on existing offers, so applying, offering, and rejecting
 * are all refused. Check the campaign because its opportunities pause in batches.
 *
 * @throws `invalid_state` with `opportunity_not_open` or `campaign_not_open`.
 */
async function requireOpportunityOpen(
  ctx: MutationCtx,
  opportunity: Doc<"opportunities">,
): Promise<Doc<"campaigns">> {
  if (opportunity.status !== "open") {
    throw apiError("invalid_state", { reason: "opportunity_not_open" });
  }
  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  if (campaign === null) {
    throw apiError("not_found", { resource: "opportunity" });
  }
  if (campaign.status !== "open") {
    throw apiError("invalid_state", { reason: "campaign_not_open" });
  }
  return campaign;
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

// Offer expiries sit on :00/:30 UTC boundaries, the same times the expiry cron
// runs, so an offer is marked expired exactly when it expires.
const HALF_HOUR_MS = 30 * 60 * 1000;

/**
 * Sends an offer on a pending application to one of the company's
 * opportunities. Offers are not capped by open slots: the first creators to
 * accept take them.
 *
 * @throws `not_found` if the application does not exist or belongs to another
 * company.
 * The default expiry is 48 hours, rounded up to the next :00 or :30 UTC. A
 * company-chosen expiry must already be on :00 or :30; it is refused rather
 * than rounded, like opportunity deadlines.
 *
 * @throws `invalid_state` if the application is not pending, the opportunity or
 * its campaign is not open, or `offerExpiresAt` is not a future :00/:30 UTC time.
 */
export async function offerApplication(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  applicationId: Id<"applications">,
  requestedExpiresAt?: number,
): Promise<Doc<"applications">> {
  const application = await requirePendingForReview(ctx, companyId, applicationId);
  const now = Date.now();
  const offerExpiresAt =
    requestedExpiresAt ??
    Math.ceil((now + DEFAULT_OFFER_DURATION_MS) / HALF_HOUR_MS) * HALF_HOUR_MS;
  if (
    !Number.isSafeInteger(offerExpiresAt) ||
    offerExpiresAt % HALF_HOUR_MS !== 0 ||
    offerExpiresAt <= now
  ) {
    throw apiError("invalid_state", { reason: "invalid_offer_expiry" });
  }

  const patch = { status: "offered" as const, statusLastUpdatedAt: now, offerExpiresAt };
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
  const patch = { status: "rejected" as const, statusLastUpdatedAt: Date.now() };
  await ctx.db.patch("applications", application._id, patch);
  return { ...application, ...patch };
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

/**
 * Accepts the creator's own unexpired offer. In one transaction this creates
 * the assignment through `createAssignmentFromOffer` (which takes a slot), and,
 * if that was the last slot, marks every remaining pending or offered
 * application as `opportunityFull`. Offers can be accepted while the
 * opportunity is paused.
 *
 * Two creators accepting the last slot at once both read the opportunity, so
 * Convex retries one, which then sees the slot is taken.
 *
 * @throws `not_found` if the application does not exist or is not the
 * creator's.
 * @throws `invalid_state` if the application has no offer, the offer has
 * expired, the opportunity is closed, or every slot is filled.
 * @throws `conflict` if the creator already has an assignment on it.
 */
export async function acceptApplication(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  applicationId: Id<"applications">,
): Promise<Doc<"applications">> {
  const application = await requireOfferedApplication(ctx, creatorId, applicationId);
  const now = Date.now();
  if (application.offerExpiresAt === undefined || application.offerExpiresAt <= now) {
    throw apiError("invalid_state", { reason: "offer_expired" });
  }
  const opportunity = await ctx.db.get("opportunities", application.opportunityId);
  if (opportunity === null) {
    throw apiError("not_found", { resource: "application" });
  }

  // Refuses a closed opportunity or a full one, then takes the slot and creates
  // the termsPending assignment with the opportunity's current terms.
  await createAssignmentFromOffer(ctx, { opportunityId: opportunity._id, creatorId });
  const patch = { status: "accepted" as const, offerAcceptedAt: now, statusLastUpdatedAt: now };
  await ctx.db.patch("applications", application._id, patch);
  if (opportunity.numFilledSlots + 1 >= opportunity.maxSlots) {
    await markRemainingApplicationsFull(ctx, opportunity, now);
  }
  return { ...application, ...patch };
}

/**
 * Declines the creator's own offer. Allowed whatever the opportunity's status,
 * since saying no never takes a slot.
 *
 * @throws `not_found` if the application does not exist or is not the
 * creator's.
 * @throws `invalid_state` if the application has no offer.
 */
export async function declineApplication(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  applicationId: Id<"applications">,
): Promise<Doc<"applications">> {
  const application = await requireOfferedApplication(ctx, creatorId, applicationId);
  const patch = { status: "declined" as const, statusLastUpdatedAt: Date.now() };
  await ctx.db.patch("applications", application._id, patch);
  return { ...application, ...patch };
}

/** Loads the creator's own application and requires it to hold an offer. */
async function requireOfferedApplication(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  applicationId: Id<"applications">,
): Promise<Doc<"applications">> {
  const application = await requireApplication(ctx, { role: "creator", creatorId }, applicationId);
  if (application.status !== "offered") {
    throw apiError("invalid_state", { reason: "application_not_offered" });
  }
  return application;
}

/**
 * Marks every pending or offered application to the opportunity as
 * `opportunityFull` once its last slot is taken. An opportunity never has more
 * than `maxApplications` applications, so this batch is bounded.
 */
async function markRemainingApplicationsFull(
  ctx: MutationCtx,
  opportunity: Doc<"opportunities">,
  now: number,
): Promise<void> {
  for (const status of ["pending", "offered"] as const) {
    const remaining = await ctx.db
      .query("applications")
      .withIndex("by_opportunityId_and_status", (q) =>
        q.eq("opportunityId", opportunity._id).eq("status", status),
      )
      .take(opportunity.maxApplications);
    for (const application of remaining) {
      await ctx.db.patch("applications", application._id, {
        status: "opportunityFull",
        statusLastUpdatedAt: now,
      });
    }
  }
}

/**
 * Marks one bounded batch of offers past their expiry as `offerExpired` and
 * reports whether more may remain. `acceptApplication` already refuses expired
 * offers, so this only makes the status visible.
 */
export async function expireApplicationOffers(ctx: MutationCtx): Promise<boolean> {
  const batchSize = 100;
  const now = Date.now();
  const expired = await ctx.db
    .query("applications")
    .withIndex("by_status_and_offerExpiresAt", (q) =>
      q.eq("status", "offered").lte("offerExpiresAt", now),
    )
    .take(batchSize);
  for (const application of expired) {
    await ctx.db.patch("applications", application._id, {
      status: "offerExpired",
      statusLastUpdatedAt: now,
    });
  }
  return expired.length === batchSize;
}
