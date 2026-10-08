import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authedQuery, companyContext, creatorMutation } from "./lib/functions";
import {
  createPost,
  listPosts,
  postCreate,
  postListFilters,
  requirePost,
  type PostViewer,
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
 * @throws `conflict` if the submission already has a post.
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
    return await requirePost(ctx, await postViewer(ctx, ctx.user), args.postId);
  },
});

/**
 * Lists posts, newest first, for exactly one of `assignmentId` or `campaignId`.
 * An assignment has at most one post. Listing by campaign is for the owning
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
    return await listPosts(ctx, await postViewer(ctx, ctx.user), args);
  },
});

async function postViewer(ctx: QueryCtx, user: Doc<"users">): Promise<PostViewer> {
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
