import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authedQuery, companyContext, creatorMutation, creatorQuery } from "./lib/functions";
import {
  createApplication,
  listApplications,
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
