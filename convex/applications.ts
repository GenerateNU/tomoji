import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  authedQuery,
  companyContext,
  companyMutation,
  companyQuery,
  creatorMutation,
  creatorQuery,
} from "./lib/functions";
import {
  acceptApplication,
  createApplication,
  declineApplication,
  listApplications,
  listApplicationsByOpportunityId,
  offerApplication,
  rejectApplication,
  requireApplication,
  type ApplicationViewer,
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
    return await requireApplication(
      ctx,
      await applicationViewer(ctx, ctx.user),
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
 * hours from now. Offers are not capped by open slots.
 *
 * @throws `not_found` if the application does not exist or belongs to another
 * company.
 * @throws `invalid_state` if the application is not pending, the opportunity is
 * paused or closed, or the expiry is not in the future.
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

/** Resolves what the caller is allowed to see from their account type. */
async function applicationViewer(ctx: QueryCtx, user: Doc<"users">): Promise<ApplicationViewer> {
  switch (user.role) {
    case "operator":
      return { role: "operator" };
    case "creator":
      return { role: "creator", creatorId: await requireCallerCreatorId(ctx, user) };
    case "company": {
      // Proves membership in the token's org, not just the account type.
      const { membership } = await companyContext(ctx);
      return { role: "company", companyId: membership.companyId };
    }
  }
}
