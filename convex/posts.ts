import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  authedQuery,
  creatorMutation,
  operatorMutation,
  requireCallerViewer,
} from "./lib/functions";
import {
  createPost,
  listPosts,
  postCreate,
  postListFilters,
  postMetrics,
  postReplacement,
  postVerification,
  replacePost,
  requirePost,
  unverifyPost,
  updatePostMetrics,
  verifyPost,
} from "./models/posts";
import { requireCallerCreatorId } from "./models/users";
import schema from "./schema";

/**
 * Records the live X post for the caller's approved submission. The link is
 * stored in its canonical `https://x.com/<handle>/status/<id>` form, and the
 * post starts unverified.
 *
 * @throws `not_found` if the submission doesn't exist or isn't the caller's.
 * @throws `invalid_state` if the submission isn't approved, the assignment
 * isn't active, or the URL isn't an X post link.
 * @throws `conflict` if the submission already has a post, or another post
 * uses the same X post.
 * @returns the new post's id.
 */
export const create = creatorMutation({
  args: postCreate.fields,
  returns: v.id("posts"),
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return await createPost(ctx, creatorId, args);
  },
});

/**
 * Gets one post. Creators see their own, company users see their company's,
 * and operators see all.
 *
 * @throws `not_found` if the post doesn't exist or isn't visible to the caller.
 */
export const get = authedQuery({
  args: { postId: v.id("posts") },
  returns: schema.doc("posts"),
  handler: async (ctx, args) => {
    return await requirePost(ctx, await requireCallerViewer(ctx, ctx.user), args.postId);
  },
});

/**
 * Lists active posts, newest first, for exactly one of `assignmentId` or
 * `campaignId`. An assignment has at most one active post. Listing by campaign is for the owning
 * company and operators.
 *
 * @throws `invalid_state` unless exactly one filter is given.
 * @throws `not_found` if the assignment or campaign isn't visible to the caller.
 * @throws `forbidden` if a creator lists by campaign.
 */
export const list = authedQuery({
  args: postListFilters.fields,
  returns: paginationResultValidator(schema.doc("posts")),
  handler: async (ctx, args) => {
    return await listPosts(ctx, await requireCallerViewer(ctx, ctx.user), args);
  },
});

/**
 * Replaces the caller's unverified post with a new one for a new link. The old
 * post stays as an inactive record for disputes, reachable through `get`.
 *
 * @throws `not_found` if the post doesn't exist or isn't the caller's.
 * @throws `invalid_state` if the post was already replaced or is verified, the
 * assignment isn't active, or the URL isn't an X post link.
 * @throws `conflict` if another submission used the same X post.
 * @returns the new post.
 */
export const replace = creatorMutation({
  args: { postId: v.id("posts"), ...postReplacement.fields },
  returns: schema.doc("posts"),
  handler: async (ctx, { postId, ...fields }) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return await replacePost(ctx, creatorId, postId, fields);
  },
});

/**
 * Marks a post verified after an operator checks it against the approved
 * submission, with `postedAt` read off the post on X.
 *
 * @throws `not_found` if the post doesn't exist.
 * @throws `invalid_state` if the assignment isn't active, the post is already
 * verified, or `postedAt` isn't a past Unix time in whole milliseconds.
 */
export const verify = operatorMutation({
  args: { postId: v.id("posts"), ...postVerification.fields },
  returns: schema.doc("posts"),
  handler: async (ctx, { postId, ...verification }) => {
    return await verifyPost(ctx, postId, verification);
  },
});

/**
 * Marks a verified post unverified, for example when it doesn't match the
 * approved submission. The creator can then fix the link.
 *
 * @throws `not_found` if the post doesn't exist.
 * @throws `invalid_state` if the assignment isn't active or the post isn't verified.
 */
export const unverify = operatorMutation({
  args: { postId: v.id("posts") },
  returns: schema.doc("posts"),
  handler: async (ctx, args) => {
    return await unverifyPost(ctx, args.postId);
  },
});

/** Stores a fresh snapshot of a post's counts. For the future X API metrics job. */
export const updateMetrics = internalMutation({
  args: { postId: v.id("posts"), ...postMetrics.fields },
  returns: schema.doc("posts"),
  handler: async (ctx, { postId, ...metrics }) => {
    return await updatePostMetrics(ctx, postId, metrics);
  },
});
