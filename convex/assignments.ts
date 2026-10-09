import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type QueryCtx } from "./_generated/server";
import {
  authedQuery,
  companyContext,
  companyMutation,
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
  creatorAssignmentListFilters,
  declineAssignmentTerms,
  exportAssignmentCreatorsCsv,
  listAssignments,
  listCreatorAssignments,
  requireAssignment,
  type AssignmentViewer,
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
export const exportCreatorsCsv = companyQuery({
  args: assignmentCreatorExportOptions.fields,
  returns: assignmentCreatorsCsv,
  handler: async (ctx, args) => {
    return await exportAssignmentCreatorsCsv(ctx, ctx.membership.companyId, args);
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
    return await requireAssignment(ctx, await assignmentViewer(ctx, ctx.user), args.assignmentId);
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

async function assignmentViewer(ctx: QueryCtx, user: Doc<"users">): Promise<AssignmentViewer> {
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
