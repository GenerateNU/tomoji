import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
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
  acceptAssignmentTerms,
  assignmentListFilters,
  cancelPendingAssignment,
  claimAssignment,
  completeAssignment,
  creatorAssignmentListFilters,
  declineAssignmentTerms,
  listAssignments,
  listCreatorAssignments,
  requireAssignment,
} from "./models/assignments";
import { requireCallerCreatorId } from "./models/users";
import schema from "./schema";

const assignment = schema.doc("assignments");

/**
 * Claims a slot on an open, ungated opportunity as the calling creator. The
 * assignment starts as `termsPending` with the opportunity's current terms.
 *
 * @throws `not_found` if the opportunity does not exist.
 * @throws `invalid_state` if the opportunity cannot be claimed. See
 * `claimAssignment` for each reason.
 * @throws `conflict` if the creator already has an assignment on it.
 * @returns the new assignment's id.
 */
export const claim = creatorMutation({
  args: { opportunityId: v.id("opportunities") },
  returns: v.id("assignments"),
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return await claimAssignment(ctx, creatorId, args.opportunityId);
  },
});

/**
 * Lists the caller's company assignments, optionally filtered by opportunity,
 * campaign, and status. Open to any company member.
 *
 * @throws `not_found` if the opportunity or campaign belongs to another
 * company.
 */
export const list = companyQuery({
  args: assignmentListFilters.fields,
  returns: paginationResultValidator(assignment),
  handler: async (ctx, args) => {
    return await listAssignments(ctx, ctx.membership.companyId, args);
  },
});

/**
 * Lists the calling creator's assignments: `current` for termsPending and
 * active, `past` for completed and cancelled. Newest first.
 */
export const listMine = creatorQuery({
  args: creatorAssignmentListFilters.fields,
  returns: paginationResultValidator(assignment),
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return await listCreatorAssignments(ctx, creatorId, args);
  },
});

/**
 * Gets one assignment. Creators see their own, company users see their
 * company's, and operators see all.
 *
 * @throws `not_found` if the assignment does not exist or is not visible to
 * the caller.
 */
export const get = authedQuery({
  args: { assignmentId: v.id("assignments") },
  returns: assignment,
  handler: async (ctx, args) => {
    return await requireAssignment(ctx, await resolveViewer(ctx, ctx.user), args.assignmentId);
  },
});

/**
 * Accepts the terms on the calling creator's assignment, making it active.
 *
 * @throws `not_found` if the assignment does not exist or is not the caller's.
 * @throws `invalid_state` if the assignment is not termsPending.
 */
export const acceptTerms = creatorMutation({
  args: { assignmentId: v.id("assignments") },
  returns: assignment,
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return await acceptAssignmentTerms(ctx, creatorId, args.assignmentId);
  },
});

/**
 * Declines the terms on the calling creator's assignment, cancelling it and
 * freeing its slot.
 *
 * @throws `not_found` if the assignment does not exist or is not the caller's.
 * @throws `invalid_state` if the assignment is not termsPending.
 */
export const declineTerms = creatorMutation({
  args: { assignmentId: v.id("assignments") },
  returns: assignment,
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return await declineAssignmentTerms(ctx, creatorId, args.assignmentId);
  },
});

/**
 * Cancels one of the caller's company assignments before the creator accepts
 * the terms, freeing its slot. Active assignments go through disputes.
 *
 * @throws `not_found` if the assignment does not exist or belongs to another
 * company.
 * @throws `invalid_state` if the assignment is not termsPending.
 */
export const cancel = companyMutation({
  args: { assignmentId: v.id("assignments") },
  returns: assignment,
  handler: async (ctx, args) => {
    return await cancelPendingAssignment(ctx, ctx.membership.companyId, args.assignmentId);
  },
});

/** Marks an active assignment completed. What triggers completion is not decided yet. */
export const complete = internalMutation({
  args: { assignmentId: v.id("assignments") },
  returns: assignment,
  handler: async (ctx, args) => {
    return await completeAssignment(ctx, args.assignmentId);
  },
});
