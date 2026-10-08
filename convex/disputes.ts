import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { authedMutation, authedQuery } from "./lib/functions";
import { requireAssignmentViewer } from "./models/assignments";
import {
  createDispute,
  disputeDraft,
  disputeView,
  listDisputes,
  requireDispute,
} from "./models/disputes";

/**
 * Opens a dispute on an assignment the caller can see, whatever its status.
 * Creators, company users, and operators can all open one, and an assignment
 * can have several. The reason and description are stored trimmed.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the caller's, or
 * `submissionId` isn't a submission on that assignment.
 * @throws `forbidden` if a company user's token names an org they don't belong to.
 * @throws `invalid_state` if the reason or description is blank or too long.
 * @returns the new dispute's id.
 */
export const create = authedMutation({
  args: disputeDraft.fields,
  returns: v.id("disputes"),
  handler: async (ctx, args) => {
    const viewer = await requireAssignmentViewer(ctx, ctx.user);
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
    const viewer = await requireAssignmentViewer(ctx, ctx.user);
    return await requireDispute(ctx, viewer, args.disputeId);
  },
});

/**
 * Lists an assignment's disputes, newest first, with cursor pagination. Each
 * row is what `get` returns to the same caller.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the caller's.
 */
export const list = authedQuery({
  args: {
    assignmentId: v.id("assignments"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(disputeView),
  handler: async (ctx, args) => {
    const viewer = await requireAssignmentViewer(ctx, ctx.user);
    return await listDisputes(ctx, viewer, args.assignmentId, args.paginationOpts);
  },
});
