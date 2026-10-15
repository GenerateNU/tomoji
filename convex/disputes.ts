import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import {
  authedMutation,
  authedQuery,
  operatorMutation,
  requireCallerAdminViewer,
  requireCallerViewer,
} from "./lib/functions";
import {
  createDispute,
  disputeCreate,
  disputeListFilters,
  disputeOverride,
  disputeResolution,
  disputeView,
  listDisputes,
  overrideDispute,
  requireDispute,
  resolveDispute,
} from "./models/disputes";
import schema from "./schema";

/**
 * Opens a dispute on an assignment the caller can see, whatever its status.
 * Creators, company users, and operators can all open one, and an assignment
 * can have several. Creators and companies each have their own reasons;
 * operators can give either. Picking "other" requires a `customReason` in the
 * opener's own words. `postId` optionally says which post it's about; other
 * evidence goes in the description. Text is stored trimmed.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the caller's, or
 * `postId` isn't a post on that assignment.
 * @throws `forbidden` if a company user's token names an org they don't belong to.
 * @throws `invalid_state` if the reason isn't one the caller's side can give, a
 * `customReason` is missing for "other" or given for any other reason, or the
 * text is blank or too long.
 * @returns the new dispute's id.
 */
export const create = authedMutation({
  args: disputeCreate.fields,
  returns: v.id("disputes"),
  handler: async (ctx, args) => {
    const viewer = await requireCallerAdminViewer(ctx, ctx.user);
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
    const viewer = await requireCallerViewer(ctx, ctx.user);
    return await requireDispute(ctx, viewer, args.disputeId);
  },
});

/**
 * Lists disputes with cursor pagination: the caller's company's or creator's,
 * or every company's for operators. `status` picks open or resolved (the Active
 * and Past tabs); `openedByRole` keeps only those one side opened. Resolved
 * disputes come most recently closed first; open ones newest first, or oldest
 * first for operators. Each row is what `get` returns to the same caller.
 *
 * @throws `forbidden` if a company user's token names an org they don't belong to.
 */
export const list = authedQuery({
  args: disputeListFilters.fields,
  returns: paginationResultValidator(disputeView),
  handler: async (ctx, args) => {
    const viewer = await requireCallerViewer(ctx, ctx.user);
    return await listDisputes(ctx, viewer, args);
  },
});

/**
 * Closes an open dispute once it's settled over email: `approved` (in the
 * opener's favor), `denied`, or `withdrawn`, with an optional note. Anyone on
 * the opener's side can close it, and so can Tomoji; only the opener's side can
 * withdraw. Closing is final; Tomoji can still override the result.
 *
 * @throws `not_found` if the dispute doesn't exist or isn't the caller's.
 * @throws `forbidden` if the caller is on the other side, or a company user's
 * token names an org they don't belong to.
 * @throws `invalid_state` if it's already resolved, Tomoji tries to withdraw a
 * dispute it didn't open, or the note is too long.
 * @returns the dispute as the caller sees it.
 */
export const resolve = authedMutation({
  args: { disputeId: v.id("disputes"), ...disputeResolution.fields },
  returns: disputeView,
  handler: async (ctx, { disputeId, ...resolution }) => {
    const viewer = await requireCallerAdminViewer(ctx, ctx.user);
    return await resolveDispute(ctx, viewer, ctx.user._id, disputeId, resolution);
  },
});

/**
 * Replaces the result the opener's side reported with Tomoji's ruling
 * (`approved` or `denied`) and a required reason. The original result stays on
 * the dispute as `overriddenResolution`. Tomoji's own rulings can't be overridden.
 *
 * @throws `not_found` if the dispute doesn't exist.
 * @throws `invalid_state` if it's still open, Tomoji already ruled on it, or the
 * reason is blank or too long.
 * @returns the overridden dispute.
 */
export const override = operatorMutation({
  args: { disputeId: v.id("disputes"), ...disputeOverride.fields },
  returns: schema.doc("disputes"),
  handler: async (ctx, { disputeId, ...ruling }) => {
    return await overrideDispute(ctx, ctx.user._id, disputeId, ruling);
  },
});
