import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authedQuery, companyContext, companyMutation, creatorMutation } from "./lib/functions";
import { requireCreatorProfile } from "./models/creators";
import {
  createSubmission,
  listSubmissions,
  requireSubmission,
  reviewSubmission,
  submissionDraft,
  submissionReview,
  submissionView,
  type SubmissionViewer,
} from "./models/submissions";
import schema from "./schema";

/**
 * Works out who is reading through `get` / `list`. Creators read as their
 * creator profile. Company users go through `companyContext`, so their token's
 * org must be one they belong to.
 *
 * @throws `not_found` for a creator without a creator profile, or `forbidden` /
 * `not_synced` / `misconfigured` from `companyContext`.
 */
async function requireViewer(ctx: QueryCtx, user: Doc<"users">): Promise<SubmissionViewer> {
  switch (user.role) {
    case "creator": {
      const { creatorId } = await requireCreatorProfile(ctx, user);
      return { role: "creator", creatorId };
    }
    case "company": {
      const { membership } = await companyContext(ctx);
      return { role: "company", companyId: membership.companyId };
    }
    case "operator":
      return { role: "operator" };
  }
}

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
    const { creatorId } = await requireCreatorProfile(ctx, ctx.user);
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
 * pending but its assignment was completed or cancelled, so it will never be
 * reviewed. Creators see their own, without who reviewed it; company users see
 * their company's and operators see any, both including the reviewers.
 *
 * @throws `not_found` if it doesn't exist or isn't the caller's to see.
 */
export const get = authedQuery({
  args: { submissionId: v.id("submissions") },
  returns: submissionView,
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx, ctx.user);
    return await requireSubmission(ctx, viewer, args.submissionId);
  },
});

/**
 * Lists an assignment's submissions, newest first, with cursor pagination. Each
 * row is what `get` returns to the same caller.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the caller's to see.
 */
export const list = authedQuery({
  args: {
    assignmentId: v.id("assignments"),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(submissionView),
  handler: async (ctx, args) => {
    const viewer = await requireViewer(ctx, ctx.user);
    return await listSubmissions(ctx, viewer, args.assignmentId, args.paginationOpts);
  },
});
