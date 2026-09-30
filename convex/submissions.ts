import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { apiError } from "./lib/errors";
import {
  authedQuery,
  companyContext,
  companyMutation,
  creatorMutation,
  creatorQuery,
} from "./lib/functions";
import { requireCreatorProfile } from "./models/creators";
import {
  createSubmission,
  creatorSubmission,
  listCreatorSubmissions,
  listSubmissions,
  requireCreatorSubmission,
  requireSubmission,
  reviewSubmission,
  submissionDraft,
  submissionReview,
  type SubmissionViewer,
} from "./models/submissions";
import schema from "./schema";

/**
 * Works out who is reading through `get` / `list`: company users and operators.
 * Company users go through `companyContext`, so their token's org must be one
 * they belong to. Creators are refused; they read through `getMine` / `listMine`.
 *
 * @throws `forbidden` for creators, or `forbidden` / `not_synced` /
 * `misconfigured` from `companyContext`.
 */
async function requireFullReader(
  ctx: QueryCtx,
  user: Doc<"users">,
): Promise<Exclude<SubmissionViewer, { role: "creator" }>> {
  switch (user.role) {
    case "company": {
      const { membership } = await companyContext(ctx);
      return { role: "company", companyId: membership.companyId };
    }
    case "operator":
      return { role: "operator" };
    case "creator":
      throw apiError("forbidden");
  }
}

/**
 * Submits a draft for review on the caller's own active assignment.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the caller's.
 * @throws `invalid_state` if the assignment isn't active, a draft is already
 * approved, or a draft field is blank, too long, or the URL isn't http(s).
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
 * that company can review. Reviews are final.
 *
 * @throws `not_found` if the submission doesn't exist or isn't the company's.
 * @throws `invalid_state` if it was already reviewed, the assignment isn't
 * active, or the review note is blank or too long.
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
 * Returns one submission as stored, including who reviewed it. Company users
 * see their company's; operators see any.
 *
 * @throws `not_found` if it doesn't exist or isn't the caller's company's.
 * @throws `forbidden` for creators, who use `getMine`.
 */
export const get = authedQuery({
  args: { submissionId: v.id("submissions") },
  returns: schema.doc("submissions"),
  handler: async (ctx, args) => {
    const viewer = await requireFullReader(ctx, ctx.user);
    return await requireSubmission(ctx, viewer, args.submissionId);
  },
});

/**
 * Lists an assignment's submissions as stored, newest first, with cursor
 * pagination. Company users see their company's; operators see any.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the caller's company's.
 * @throws `forbidden` for creators, who use `listMine`.
 */
export const list = authedQuery({
  args: { assignmentId: v.id("assignments"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("submissions")),
  handler: async (ctx, args) => {
    const viewer = await requireFullReader(ctx, ctx.user);
    return await listSubmissions(ctx, viewer, args.assignmentId, args.paginationOpts);
  },
});

/**
 * Returns one of the caller's own submissions in the creator shape: the draft
 * and review outcome, without who reviewed it or any dispute details.
 *
 * @throws `not_found` if it doesn't exist or isn't the caller's.
 */
export const getMine = creatorQuery({
  args: { submissionId: v.id("submissions") },
  returns: creatorSubmission,
  handler: async (ctx, args) => {
    const { creatorId } = await requireCreatorProfile(ctx, ctx.user);
    return await requireCreatorSubmission(ctx, creatorId, args.submissionId);
  },
});

/**
 * Lists the submissions on one of the caller's own assignments, newest first,
 * in the creator shape, with cursor pagination.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the caller's.
 */
export const listMine = creatorQuery({
  args: { assignmentId: v.id("assignments"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(creatorSubmission),
  handler: async (ctx, args) => {
    const { creatorId } = await requireCreatorProfile(ctx, ctx.user);
    return await listCreatorSubmissions(ctx, creatorId, args.assignmentId, args.paginationOpts);
  },
});
