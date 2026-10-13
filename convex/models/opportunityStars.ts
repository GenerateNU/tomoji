import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import {
  creatorOpportunity,
  getVisibleCreatorOpportunity,
  requireOpportunity,
  type CreatorOpportunity,
} from "./opportunities";

/** The creator-facing brief plus whether the calling creator has starred it. */
export const starredCreatorOpportunity = creatorOpportunity.extend({ isStarred: v.boolean() });
export type StarredCreatorOpportunity = Infer<typeof starredCreatorOpportunity>;

export const starredOpportunityList = v.object({ paginationOpts: paginationOptsValidator });

async function getStar(
  ctx: QueryCtx | MutationCtx,
  creatorId: Id<"creators">,
  opportunityId: Id<"opportunities">,
): Promise<Doc<"opportunityStars"> | null> {
  return await ctx.db
    .query("opportunityStars")
    .withIndex("by_creatorId_and_opportunityId", (q) =>
      q.eq("creatorId", creatorId).eq("opportunityId", opportunityId),
    )
    .first();
}

/**
 * Stars an opportunity the creator can see. Starring again does nothing, so a
 * double tap or a retried request never creates a second star.
 *
 * @throws `not_found` if the creator or opportunity doesn't exist, or the
 * opportunity isn't visible to creators (not open, campaign not open, or
 * company inactive).
 */
export async function starOpportunity(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  opportunityId: Id<"opportunities">,
): Promise<void> {
  const creator = await ctx.db.get("creators", creatorId);
  const user = creator && (await ctx.db.get("users", creator.userId));
  if (!user) throw apiError("not_found", { resource: "creator" });
  // Same visibility as `opportunities.get` for creators.
  await requireOpportunity(ctx, opportunityId, { user, orgId: null });
  if ((await getStar(ctx, creatorId, opportunityId)) !== null) return;
  await ctx.db.insert("opportunityStars", { creatorId, opportunityId });
}

/**
 * Removes the creator's star. Does nothing if there isn't one, and works even
 * after the opportunity closes so creators can always clean up their list.
 */
export async function unstarOpportunity(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  opportunityId: Id<"opportunities">,
): Promise<void> {
  const star = await getStar(ctx, creatorId, opportunityId);
  if (star !== null) await ctx.db.delete("opportunityStars", star._id);
}

/**
 * Returns one page of the creator's starred briefs, most recently starred
 * first. Opportunities creators can no longer see (paused, closed, inactive
 * company) are left out, so a page can be shorter than requested; the star is
 * kept and reappears if the opportunity reopens.
 */
export async function listStarredOpportunities(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  options: Infer<typeof starredOpportunityList>,
): Promise<PaginationResult<StarredCreatorOpportunity>> {
  const result = await ctx.db
    .query("opportunityStars")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creatorId))
    .order("desc")
    .paginate(options.paginationOpts);
  const visible = await Promise.all(
    result.page.map(async (star) => {
      const opportunity = await ctx.db.get("opportunities", star.opportunityId);
      const brief = opportunity && (await getVisibleCreatorOpportunity(ctx, opportunity));
      return brief ? { ...brief, isStarred: true } : null;
    }),
  );
  // Keep the native cursor and isDone so callers can continue past a short page.
  return { ...result, page: visible.filter((brief) => brief !== null) };
}

/** Whether the creator has starred the opportunity. */
export async function isOpportunityStarred(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  opportunityId: Id<"opportunities">,
): Promise<boolean> {
  return (await getStar(ctx, creatorId, opportunityId)) !== null;
}

/** Adds `isStarred` for the creator to each brief, e.g. a page of the discovery feed. */
export async function withStarredFlags(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  briefs: CreatorOpportunity[],
): Promise<StarredCreatorOpportunity[]> {
  return await Promise.all(
    briefs.map(async (brief) => ({
      ...brief,
      isStarred: await isOpportunityStarred(ctx, creatorId, brief._id),
    })),
  );
}
