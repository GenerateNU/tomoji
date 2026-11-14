import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  authedQuery,
  requireCallerViewer,
  companyMutation,
  companyQuery,
  creatorMutation,
  creatorQuery,
} from "./lib/functions";
import {
  acceptApplication,
  acceptedOffer,
  createApplication,
  declineApplication,
  expireApplicationOffers,
  applicationDetail,
  applicationSearch,
  applicationSearchResult,
  listApplicationRows,
  listApplicationsByOpportunityId,
  markApplicationsFullBatch,
  offerApplication,
  rejectApplication,
  requireApplication,
  requireApplicationDetail,
} from "./models/applications";
import { requireCallerCreatorId } from "./models/users";
import schema from "./schema";
import { applicationStatus } from "./schemas/applications.schema";

const application = schema.doc("applications");

/**
 * Applies to an open, gated opportunity as the calling creator, with an
 * optional note.
 *
 * @throws `not_found` if the opportunity does not exist.
 * @throws `invalid_state` if the opportunity cannot take applications. See
 * `createApplication` for each reason.
 * @throws `conflict` if the creator has already applied.
 * @returns the new application's id.
 */
export const create = creatorMutation({
  args: { opportunityId: v.id("opportunities"), note: v.optional(v.string()) },
  returns: v.id("applications"),
  handler: async (ctx, args) => {
    return await createApplication(ctx, await requireCallerCreatorId(ctx, ctx.user), args);
  },
});

/**
 * Searches the calling creator's applications or offers: one page of rows for
 * the requested tab plus a count for each tab. See `listApplicationRows` for
 * the read limits and per-tab sorting.
 *
 * @throws `invalid_state` if the page, page size or search is out of bounds.
 */
export const searchMine = creatorQuery({
  args: applicationSearch.fields,
  returns: applicationSearchResult,
  handler: async (ctx, args) => {
    return await listApplicationRows(ctx, await requireCallerCreatorId(ctx, ctx.user), args);
  },
});

/**
 * Gets one of the calling creator's applications with its opportunity brief and
 * what they can do with it, for the offer details.
 *
 * @throws `not_found` if the application does not exist, is not the caller's,
 * or its opportunity was deleted.
 */
export const getMineDetail = creatorQuery({
  args: { applicationId: v.id("applications") },
  returns: applicationDetail,
  handler: async (ctx, args) => {
    return await requireApplicationDetail(
      ctx,
      await requireCallerCreatorId(ctx, ctx.user),
      args.applicationId,
    );
  },
});

/**
 * Gets one application. Creators see their own, company users see applications
 * to their company's opportunities, and operators see all.
 *
 * @throws `not_found` if the application does not exist or is not visible to
 * the caller.
 */
export const get = authedQuery({
  args: { applicationId: v.id("applications") },
  returns: application,
  handler: async (ctx, args) => {
    return await requireApplication(
      ctx,
      await requireCallerViewer(ctx, ctx.user),
      args.applicationId,
    );
  },
});

/**
 * Lists applications to one of the caller's company's opportunities, optionally
 * filtered by status. Open to any company member.
 *
 * @throws `not_found` if the opportunity does not exist or belongs to another
 * company.
 */
export const list = companyQuery({
  args: {
    opportunityId: v.id("opportunities"),
    status: v.optional(applicationStatus),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(application),
  handler: async (ctx, args) => {
    return await listApplicationsByOpportunityId(ctx, ctx.membership.companyId, args);
  },
});

/**
 * Sends an offer on a pending application. `offerExpiresAt` defaults to 48
 * hours from now, rounded up to the next :00 or :30 UTC; a chosen expiry must
 * be on :00 or :30. Offers are not capped by open slots.
 *
 * @throws `not_found` if the application does not exist or belongs to another
 * company.
 * @throws `invalid_state` if the application is not pending, the opportunity is
 * paused or closed, or the expiry is not a future :00/:30 UTC time.
 */
export const offer = companyMutation({
  args: {
    applicationId: v.id("applications"),
    offerExpiresAt: v.optional(v.number()),
  },
  returns: application,
  handler: async (ctx, args) => {
    return await offerApplication(
      ctx,
      ctx.membership.companyId,
      args.applicationId,
      args.offerExpiresAt,
    );
  },
});

/**
 * Rejects a pending application.
 *
 * @throws `not_found` if the application does not exist or belongs to another
 * company.
 * @throws `invalid_state` if the application is not pending or the opportunity
 * is paused or closed.
 */
export const reject = companyMutation({
  args: { applicationId: v.id("applications") },
  returns: application,
  handler: async (ctx, args) => {
    return await rejectApplication(ctx, ctx.membership.companyId, args.applicationId);
  },
});

/**
 * Accepts the caller's own unexpired offer: takes a slot and creates an active
 * assignment, first come first serve. When the opportunity has a review
 * policy, `acceptedTerms` must be true. Works while the opportunity is paused.
 *
 * @throws `not_found` if the application does not exist or is not the caller's.
 * @throws `invalid_state` if there is no offer, it has expired, the opportunity
 * is closed, every slot is filled, or the terms were required but not accepted
 * (`terms_not_accepted`).
 * @throws `conflict` if the caller already has an assignment on it.
 */
export const accept = creatorMutation({
  args: { applicationId: v.id("applications"), acceptedTerms: v.optional(v.boolean()) },
  returns: acceptedOffer,
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return await acceptApplication(ctx, creatorId, args.applicationId, {
      acceptedTerms: args.acceptedTerms,
    });
  },
});

/**
 * Declines the caller's own offer. Works whatever the opportunity's status.
 *
 * @throws `not_found` if the application does not exist or is not the caller's.
 * @throws `invalid_state` if there is no offer.
 */
export const decline = creatorMutation({
  args: { applicationId: v.id("applications") },
  returns: application,
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return await declineApplication(ctx, creatorId, args.applicationId);
  },
});

/** Drains expired offers in bounded transactions for the offer expiry cron. */
export const expireOffers = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const hasMore = await expireApplicationOffers(ctx);
    if (hasMore) await ctx.scheduler.runAfter(0, internal.applications.expireOffers, {});
    return null;
  },
});

/**
 * Marks one batch of an opportunity's waiting applications as `opportunityFull`
 * and reschedules itself while more remain. Enqueued by `acceptApplication`
 * when the last slot is taken.
 */
export const markFull = internalMutation({
  args: { opportunityId: v.id("opportunities") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const hasMore = await markApplicationsFullBatch(ctx, args.opportunityId);
    if (hasMore) await ctx.scheduler.runAfter(0, internal.applications.markFull, args);
    return null;
  },
});
