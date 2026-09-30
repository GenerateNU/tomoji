import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { creatorMutation } from "./lib/functions";
import { claimAssignment, createAssignmentFromOffer } from "./models/assignments";
import { requireCallerCreatorId } from "./models/users";

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
 * Creates the assignment for an accepted offer on a gated opportunity.
 * Mutations that accept offers should call `createAssignmentFromOffer`
 * directly so the application and assignment are written in one transaction.
 */
export const createFromOffer = internalMutation({
  args: { opportunityId: v.id("opportunities"), creatorId: v.id("creators") },
  returns: v.id("assignments"),
  handler: async (ctx, args) => {
    return await createAssignmentFromOffer(ctx, args);
  },
});
