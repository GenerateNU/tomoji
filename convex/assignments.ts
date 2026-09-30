import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import {
  authedQuery,
  companyContext,
  companyQuery,
  creatorMutation,
  creatorQuery,
} from "./lib/functions";
import {
  assignmentList,
  claimAssignment,
  creatorAssignmentList,
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
  args: assignmentList.fields,
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
  args: creatorAssignmentList.fields,
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
