import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { authedMutation, authedQuery, companyContext, operatorMutation } from "./lib/functions";
import type { AssignmentViewer } from "./models/assignments";
import {
  createDispute,
  disputeDraft,
  disputeListFilters,
  disputeResolution,
  disputeView,
  listDisputes,
  requireDispute,
  resolveDispute,
} from "./models/disputes";
import { requireCallerCreatorId } from "./models/users";
import schema from "./schema";

/** Company users go through `companyContext`, so their token's org must be one they belong to. */
async function requireViewer(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
): Promise<AssignmentViewer> {
  switch (user.role) {
    case "creator":
      return { role: "creator", creatorId: await requireCallerCreatorId(ctx, user) };
    case "company": {
      const { membership } = await companyContext(ctx);
      return { role: "company", companyId: membership.companyId };
    }
    case "operator":
      return { role: "operator" };
  }
}

/**
 * Opens a dispute on an assignment the caller can see, whatever its status.
 * Creators, company users, and operators can all open one, and an assignment
 * can have several. Creators and companies each have their own reasons;
 * operators can give either. The assignment's approved submission and its
 * posts are recorded as evidence, and the description is stored trimmed.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the caller's.
 * @throws `forbidden` if a company user's token names an org they don't belong to.
 * @throws `invalid_state` if the reason isn't one the caller's side can give,
 * or the description is blank or too long.
 * @returns the new dispute's id.
 */
export const create = authedMutation({
  args: disputeDraft.fields,
  returns: v.id("disputes"),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx, ctx.user);
    return await createDispute(ctx, viewer, ctx.user._id, args);
  },
});

/**
 * Returns one dispute. Creators see disputes on their own assignments, without
 * user IDs; company users see their company's and operators see any.
 *
 * @throws `not_found` if it doesn't exist or isn't the caller's.
 */
export const get = authedQuery({
  args: { disputeId: v.id("disputes") },
  returns: disputeView,
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx, ctx.user);
    return await requireDispute(ctx, viewer, args.disputeId);
  },
});

/**
 * Lists disputes in one status with cursor pagination: the caller's company's
 * or creator's, or every company's for operators. `openedByRole` keeps only
 * those one side opened. Resolved disputes come most recently closed first;
 * open ones newest first, or oldest first for operators. Each row is what
 * `get` returns to the same caller.
 *
 * @throws `forbidden` if a company user's token names an org they don't belong to.
 */
export const list = authedQuery({
  args: disputeListFilters.fields,
  returns: paginationResultValidator(disputeView),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx, ctx.user);
    return await listDisputes(ctx, viewer, args);
  },
});

/**
 * Closes an open dispute with an outcome and Tomoji's decision, which both
 * sides can read. Resolving is final. The decision is stored trimmed.
 *
 * @throws `not_found` if the dispute doesn't exist.
 * @throws `invalid_state` if it's already resolved, or the decision is blank or
 * too long.
 * @returns the resolved dispute.
 */
export const resolve = operatorMutation({
  args: { disputeId: v.id("disputes"), ...disputeResolution.fields },
  returns: schema.doc("disputes"),
  handler: async (ctx, { disputeId, ...resolution }) => {
    return await resolveDispute(ctx, ctx.user._id, disputeId, resolution);
  },
});
