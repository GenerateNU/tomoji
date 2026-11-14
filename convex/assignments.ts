import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  authedQuery,
  requireCallerViewer,
  companyAdminMutation,
  companyMutation,
  companyAdminQuery,
  companyQuery,
  creatorMutation,
  creatorQuery,
} from "./lib/functions";
import {
  acceptAssignmentTerms,
  assignmentCreatorExportOptions,
  assignmentCreatorsCsv,
  assignmentListFilters,
  cancelPendingAssignment,
  claimAssignment,
  completeAssignment,
  creatorAssignment,
  creatorAssignmentListFilters,
  declineAssignmentTerms,
  exportAssignmentCreatorsCsv,
  listAssignments,
  listCreatorAssignments,
  markAssignmentProductAccessDelivered,
  requireAssignment,
  toCreatorAssignment,
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
 * Exports creator contact details for exactly one company-owned campaign or
 * opportunity. Includes every assignment status and one row per assignment.
 * CSV columns: assignmentId, campaignId, opportunityId, status, name, email.
 * Missing/deactivated profiles have blank contact fields. Names use first/last
 * name, falling back to the legacy name or email. Formula-like cells are escaped.
 *
 * Start with paginationOpts { numItems: 100, cursor: null }. Concatenate each
 * result.csv, then request continueCursor with the same scope until isDone.
 * Only the first page includes a header. Save as fileName with text/csv MIME type.
 * Use sequential queries, not reactive usePaginatedQuery: endCursor is unsupported.
 * Pages reflect current data, not a single snapshot of the entire export.
 *
 * @throws `not_found` for a missing or foreign parent, including empty scopes.
 * @throws `invalid_state` unless exactly one parent is supplied and numItems is
 * an integer from 1–100, or when a non-null endCursor is supplied.
 */
export const exportCreatorsCsv = companyAdminQuery({
  args: assignmentCreatorExportOptions.fields,
  returns: assignmentCreatorsCsv,
  handler: async (ctx, args) => {
    return await exportAssignmentCreatorsCsv(ctx, ctx.membership.companyId, args);
  },
});

/**
 * Lists the calling creator's assignments: `current` for termsPending and
 * active, `past` for completed and cancelled. Newest first.
 * Includes delivery time without the company-user audit ID.
 */
export const listMine = creatorQuery({
  args: creatorAssignmentListFilters.fields,
  returns: paginationResultValidator(creatorAssignment),
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    const result = await listCreatorAssignments(ctx, creatorId, args);
    return { ...result, page: result.page.map(toCreatorAssignment) };
  },
});

/**
 * Gets one assignment. Creators see their own, company users see their
 * company's, and operators see all. Delivery actor IDs are omitted for creators.
 *
 * @throws `not_found` if the assignment does not exist or is not visible to
 * the caller.
 */
export const get = authedQuery({
  args: { assignmentId: v.id("assignments") },
  returns: v.union(assignment, creatorAssignment),
  handler: async (ctx, args) => {
    const viewer = await requireCallerViewer(ctx, ctx.user);
    const result = await requireAssignment(ctx, viewer, args.assignmentId);
    return viewer.role === "creator" ? toCreatorAssignment(result) : result;
  },
});

/**
 * Accepts the terms on the calling creator's assignment, making it active.
 * Returns the creator view, including delivery time but no delivery actor ID.
 *
 * @throws `not_found` if the assignment does not exist or is not the caller's.
 * @throws `invalid_state` if the assignment is not termsPending.
 */
export const acceptTerms = creatorMutation({
  args: { assignmentId: v.id("assignments") },
  returns: creatorAssignment,
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    const updated = await acceptAssignmentTerms(ctx, creatorId, args.assignmentId);
    return toCreatorAssignment(updated);
  },
});

/**
 * Declines the terms on the calling creator's assignment, cancelling it and
 * freeing its slot.
 * Returns the creator view, including delivery time but no delivery actor ID.
 *
 * @throws `not_found` if the assignment does not exist or is not the caller's.
 * @throws `invalid_state` if the assignment is not termsPending.
 */
export const declineTerms = creatorMutation({
  args: { assignmentId: v.id("assignments") },
  returns: creatorAssignment,
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    const updated = await declineAssignmentTerms(ctx, creatorId, args.assignmentId);
    return toCreatorAssignment(updated);
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
export const cancel = companyAdminMutation({
  args: { assignmentId: v.id("assignments") },
  returns: assignment,
  handler: async (ctx, args) => {
    return await cancelPendingAssignment(ctx, ctx.membership.companyId, args.assignmentId);
  },
});

/**
 * Marks product access delivered for 1–100 assignment IDs in the caller's company.
 * Open to any company member. The server records the delivery time and actor;
 * repeated confirmations preserve the original delivery details.
 *
 * @throws `not_found` if any assignment is missing or belongs to another company.
 * @throws `invalid_state` for an invalid batch size or a new confirmation on a
 * cancelled assignment. A rejected batch leaves every assignment unchanged.
 * @returns the updated assignments once each, in first-occurrence input order.
 */
export const markProductAccessDelivered = companyMutation({
  args: { assignmentIds: v.array(v.id("assignments")) },
  returns: v.array(assignment),
  handler: async (ctx, args) => {
    return await markAssignmentProductAccessDelivered(ctx, ctx.membership, args.assignmentIds);
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
