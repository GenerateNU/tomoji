import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { authedQuery, companyMutation, creatorMutation, resolveViewer } from "./lib/functions";
import {
  createSubmission,
  listSubmissions,
  requireSubmission,
  reviewSubmission,
  submissionDraft,
  submissionReview,
  submissionView,
} from "./models/submissions";
import { requireCallerCreatorId } from "./models/users";
import schema from "./schema";

/**
 * Submits a draft for review on the caller's own active assignment. The URL is
 * stored in its parsed form.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the caller's.
 * @throws `invalid_state` if the assignment isn't active, a draft is already
 * approved, a draft field is blank or too long, or the URL isn't http(s) or
 * includes login details.
 * @throws `conflict` if a draft is already pending review.
 * @returns the new submission's id.
 */
export const create = creatorMutation({
  args: submissionDraft.fields,
  returns: v.id("submissions"),
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return await createSubmission(ctx, creatorId, args);
  },
});

/**
 * Reviews a pending submission from the caller's company. Any company user in
 * that company can review. Reviews are final. A blank note on an approval is
 * stored as no note.
 *
 * @throws `not_found` if the submission doesn't exist or isn't the company's.
 * @throws `invalid_state` if it was already reviewed, the assignment isn't
 * active, the note on a change request is blank, or the note is too long.
 * @returns the reviewed submission.
 */
export const review = companyMutation({
  args: {
    submissionId: v.id("submissions"),
    review: submissionReview,
  },
  returns: schema.doc("submissions"),
  handler: async (ctx, args) => {
    return await reviewSubmission(ctx, ctx.membership, args.submissionId, args.review);
  },
});

/**
 * Returns one submission, plus `closedWithoutReview`: `true` if it's still
 * pending but its assignment was completed or cancelled.
 * Creators see their own, without reviewer IDs; company users see their company's
 * and operators see any.
 *
 * @throws `not_found` if it doesn't exist or isn't the caller's.
 */
export const get = authedQuery({
  args: { submissionId: v.id("submissions") },
  returns: submissionView,
  handler: async (ctx, args) => {
    const viewer = await resolveViewer(ctx, ctx.user);
    return await requireSubmission(ctx, viewer, args.submissionId);
  },
});

/**
 * Lists an assignment's submissions, newest first, with cursor pagination. Each
 * row is what `get` returns to the same caller.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the caller's.
 */
export const list = authedQuery({
  args: {
    assignmentId: v.id("assignments"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(submissionView),
  handler: async (ctx, args) => {
    const viewer = await resolveViewer(ctx, ctx.user);
    return await listSubmissions(ctx, viewer, args.assignmentId, args.paginationOpts);
  },
});
