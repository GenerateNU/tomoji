import { v } from "convex/values";
import { creatorMutation } from "./lib/functions";
import { requireCreatorProfile } from "./models/creators";
import { createSubmission, submissionDraft } from "./models/submissions";

/**
 * Submits a draft for review on the caller's own active assignment.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the caller's.
 * @throws `invalid_state` if the assignment isn't active, a draft is already
 * approved, or a draft field is blank or the URL isn't http(s).
 * @throws `conflict` if a draft is already pending review.
 * @returns the new submission's id.
 */
export const create = creatorMutation({
    args: submissionDraft.fields,
    returns: v.id("submissions"),
    handler: async (ctx, args) => {
        const { creatorId } = await requireCreatorProfile(ctx, ctx.user);
        return await createSubmission(ctx, creatorId, args);
    },
});