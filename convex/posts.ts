import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { authedQuery, companyContext, creatorMutation } from "./lib/functions";
import { createPost, postCreate, requirePost, type PostViewer } from "./models/posts";
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
