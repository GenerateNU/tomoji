import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import {
  authedQuery,
  companyMutation,
  companyQuery,
  creatorMutation,
  creatorQuery,
  resolveViewer,
} from "./lib/functions";
import {
  acceptApplication,
  createApplication,
  declineApplication,
  expireApplicationOffers,
  listApplications,
  listApplicationsByOpportunityId,
  offerApplication,
  rejectApplication,
  requireApplication,
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

/** Lists the calling creator's applications, optionally filtered by status. */
export const listMine = creatorQuery({
  args: { status: v.optional(applicationStatus), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(application),
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return await listApplications(ctx, { ...args, creatorId });
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
    return await requireApplication(ctx, await resolveViewer(ctx, ctx.user), args.applicationId);
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
  args: { applicationId: v.id("applications"), offerExpiresAt: v.optional(v.number()) },
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
 * Accepts the caller's own unexpired offer: takes a slot and creates the
 * assignment, first come first serve. Works while the opportunity is paused.
 *
 * @throws `not_found` if the application does not exist or is not the caller's.
 * @throws `invalid_state` if there is no offer, it has expired, the opportunity
 * is closed, or every slot is filled.
 */
export const accept = creatorMutation({
  args: { applicationId: v.id("applications") },
  returns: application,
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return await acceptApplication(ctx, creatorId, args.applicationId);
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
