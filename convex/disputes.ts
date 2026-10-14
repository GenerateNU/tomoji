import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { authedMutation, authedQuery, requireCallerViewer } from "./lib/functions";
import {
  createDispute,
  disputeCreate,
  disputeListFilters,
  disputeView,
  listDisputes,
  requireDispute,
} from "./models/disputes";

/**
 * Opens a dispute on an assignment the caller can see, whatever its status.
 * Creators, company users, and operators can all open one, and an assignment
 * can have several. Creators and companies each have their own reasons;
 * operators can give either. Picking "other" requires a `customReason` in the
 * opener's own words. Evidence goes in the description. Text is stored trimmed.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the caller's.
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
    const viewer = await requireCallerViewer(ctx, ctx.user);
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
 * Lists the caller's company's or creator's disputes, newest first, with
 * cursor pagination. `status` picks open or resolved (the Active and Past
 * tabs); `openedByRole` keeps only those one side opened. Each row is what
 * `get` returns to the same caller.
 *
 * @throws `forbidden` for operators, and for a company user whose token names
 * an org they don't belong to.
 */
export const list = authedQuery({
  args: disputeListFilters.fields,
  returns: paginationResultValidator(disputeView),
  handler: async (ctx, args) => {
    const viewer = await requireCallerViewer(ctx, ctx.user);
    return await listDisputes(ctx, viewer, args);
  },
});
