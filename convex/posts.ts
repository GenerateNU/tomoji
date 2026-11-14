import { paginationResultValidator } from "convex/server";
import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import { apiError } from "./lib/errors";
import { requireIdentity } from "./lib/authz";
import { action, env, internalMutation, internalQuery } from "./_generated/server";
import {
  authedQuery,
  creatorMutation,
  creatorContext,
  operatorMutation,
  operatorAction,
  requireCallerViewer,
} from "./lib/functions";
import {
  createPost,
  getPostCaptionInput,
  captionCheckReservation,
  creatorCaptionCheck,
  startCreatorCaptionCheck,
  finishCreatorCaptionCheck,
  listPosts,
  postCreate,
  postListFilters,
  postEngagement,
  postReplacement,
  postVerification,
  replacePost,
  requirePost,
  unverifyPost,
  updatePostEngagement,
  updatePostViews,
  verifyPost,
} from "./models/posts";
import { requireCallerCreatorId } from "./models/users";
import schema from "./schema";
import { getXPostForCaptionCheck, getXPostText, normalizeCaption } from "./lib/xApi";

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
 * `campaignId`. An assignment has at most one active post per deliverable, all
 * returned in one page. Listing by campaign is for the owning
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

/** Stores a post's current view count, which payouts use. For the X metrics sync. */
export const updateViews = internalMutation({
  args: { postId: v.id("posts"), views: v.number() },
  returns: schema.doc("posts"),
  handler: async (ctx, { postId, views }) => {
    return await updatePostViews(ctx, postId, views);
  },
});

/** Stores a post's engagement counts, apart from its views. For the X metrics sync. */
export const updateEngagement = internalMutation({
  args: { postId: v.id("posts"), ...postEngagement.fields },
  returns: schema.doc("posts"),
  handler: async (ctx, { postId, ...engagement }) => {
    return await updatePostEngagement(ctx, postId, engagement);
  },
});

/** Loads the linked post ID and creator-submitted caption for the operator action. */
export const captionInput = internalQuery({
  args: { postId: v.id("posts") },
  returns: v.object({ xPostId: v.string(), caption: v.optional(v.string()) }),
  handler: async (ctx, { postId }) => await getPostCaptionInput(ctx, postId),
});

const captionMatch = v.union(v.literal("match"), v.literal("mismatch"), v.literal("no_caption"));

/** Compares the published caption to the approved submission for operator verification. */
export const checkCaption = operatorAction({
  args: { postId: v.id("posts") },
  returns: captionMatch,
  handler: async (ctx, { postId }): Promise<"match" | "mismatch" | "no_caption"> => {
    const input = await ctx.runQuery(internal.posts.captionInput, { postId });
    if (!input.caption) return "no_caption";
    const token = env.X_BEARER_TOKEN?.trim();
    if (!token) throw apiError("misconfigured", { reason: "x_bearer_token_missing" });
    const published = await getXPostText(token, input.xPostId);
    // A creator can replace the post while the provider request is in flight.
    await ctx.runQuery(internal.posts.captionInput, { postId });
    return normalizeCaption(input.caption) === normalizeCaption(published) ? "match" : "mismatch";
  },
});

/** Reserves a lookup after proving the caller owns the current active post. */
export const beginCaptionCheck = internalMutation({
  args: { postId: v.id("posts") },
  returns: captionCheckReservation,
  handler: async (ctx, { postId }) => {
    const { user } = await creatorContext(ctx);
    return await startCreatorCaptionCheck(ctx, await requireCallerCreatorId(ctx, user), postId);
  },
});

/** Applies a successful provider response to the same owned post checked earlier. */
export const saveCaptionCheck = internalMutation({
  args: {
    postId: v.id("posts"),
    startedAt: v.number(),
    published: v.object({
      text: v.string(),
      authorId: v.string(),
      postedAt: v.number(),
      hasExtraContent: v.boolean(),
    }),
  },
  returns: creatorCaptionCheck,
  handler: async (ctx, { postId, startedAt, published }) => {
    const { user } = await creatorContext(ctx);
    return await finishCreatorCaptionCheck(
      ctx,
      await requireCallerCreatorId(ctx, user),
      postId,
      startedAt,
      published,
    );
  },
});

/** Checks the published X caption for an approved draft from the calling creator. */
export const checkMyCaption = action({
  args: { postId: v.id("posts") },
  returns: creatorCaptionCheck,
  handler: async (ctx, { postId }): Promise<Infer<typeof creatorCaptionCheck>> => {
    await requireIdentity(ctx);
    const input = await ctx.runMutation(internal.posts.beginCaptionCheck, { postId });
    if (input.status !== "lookup") return input.status;
    const token = env.X_BEARER_TOKEN?.trim();
    if (!token) throw apiError("misconfigured", { reason: "x_bearer_token_missing" });
    const published = await getXPostForCaptionCheck(token, input.xPostId);
    return await ctx.runMutation(internal.posts.saveCaptionCheck, {
      postId,
      startedAt: input.startedAt,
      published,
    });
  },
});
