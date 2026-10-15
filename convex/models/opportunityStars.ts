import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { stream } from "convex-helpers/server/stream";
import { withRowsReadCap } from "../lib/pagination";
import schema from "../schema";
import {
  creatorOpportunity,
  getVisibleCreatorOpportunity,
  requireOpportunity,
  type CreatorOpportunity,
} from "./opportunities";
import { requireCallerCreatorId } from "./users";

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
 * Stars an opportunity for the signed-in creator, if creators can see it.
 * Starring again does nothing, so a double tap or a retried request never
 * creates a second star.
 *
 * @throws `not_found` if the creator or opportunity doesn't exist, or the
 * opportunity isn't visible to creators (not open, campaign not open, or
 * company inactive).
 */
export async function starOpportunity(
  ctx: MutationCtx,
  user: Doc<"users">,
  opportunityId: Id<"opportunities">,
): Promise<void> {
  // Same visibility as `opportunities.get` for creators.
  await requireOpportunity(ctx, opportunityId, { user, orgId: null });
  const creatorId = await requireCallerCreatorId(ctx, user);
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
 * company) are skipped; the star is kept and reappears if the opportunity
 * reopens.
 */
export async function listStarredOpportunities(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  options: Infer<typeof starredOpportunityList>,
): Promise<PaginationResult<StarredCreatorOpportunity>> {
  // Filter inside the stream so hidden stars don't leave pages short or empty.
  return await stream(ctx.db, schema)
    .query("opportunityStars")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creatorId))
    .order("desc")
    .map(async (star) => {
      const opportunity = await ctx.db.get("opportunities", star.opportunityId);
      const brief = opportunity && (await getVisibleCreatorOpportunity(ctx, opportunity));
      return brief ? { ...brief, isStarred: true } : null;
    })
    .paginate(withRowsReadCap(options.paginationOpts));
}

/** Whether the creator has starred the opportunity. */
export async function isOpportunityStarred(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  opportunityId: Id<"opportunities">,
): Promise<boolean> {
  return (await getStar(ctx, creatorId, opportunityId)) !== null;
}

/** Most stars loaded in one read when flagging a page of briefs. */
const MAX_STARS_READ = 1000;

/** Adds `isStarred` for the creator to each brief, e.g. a page of the discovery feed. */
export async function withStarredFlags(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  briefs: CreatorOpportunity[],
): Promise<StarredCreatorOpportunity[]> {
  // One read of the creator's stars instead of one lookup per brief.
  const stars = await ctx.db
    .query("opportunityStars")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creatorId))
    .take(MAX_STARS_READ);
  if (stars.length === MAX_STARS_READ) {
    // Some stars weren't loaded, so a missing ID doesn't mean "not starred".
    return await Promise.all(
      briefs.map(async (brief) => ({
        ...brief,
        isStarred: await isOpportunityStarred(ctx, creatorId, brief._id),
      })),
    );
  }
  const starred = new Set(stars.map((star) => star.opportunityId));
  return briefs.map((brief) => ({ ...brief, isStarred: starred.has(brief._id) }));
}
