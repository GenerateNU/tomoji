import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { applicationStatus } from "../schemas/applications.schema";
import { assignmentStatus } from "../schemas/assignments.schema";
import { describeMatch, getCreatorSignals, opportunityMatch } from "./opportunityMatch";
import { starredCreatorOpportunity, type StarredCreatorOpportunity } from "./opportunityStars";

/**
 * A brief as one creator sees it in their feed: whether they starred it,
 * their application and assignment for it, if any, and how well it matches
 * their profile. Cards use these to show "Applied" or "Claimed spot", pick the
 * next action, and say how good a fit it is.
 */
export const creatorFeedOpportunity = starredCreatorOpportunity.extend({
  application: v.union(
    v.null(),
    v.object({ _id: v.id("applications"), status: applicationStatus }),
  ),
  assignment: v.union(v.null(), v.object({ _id: v.id("assignments"), status: assignmentStatus })),
  match: opportunityMatch,
});
export type CreatorFeedOpportunity = Infer<typeof creatorFeedOpportunity>;

/**
 * Adds the creator's latest application and assignment, and their match, to
 * each brief, e.g. a page of the feed.
 */
export async function withCreatorProgress(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  briefs: StarredCreatorOpportunity[],
): Promise<CreatorFeedOpportunity[]> {
  const creator = await ctx.db.get("creators", creatorId);
  const signals =
    creator === null ? { niches: [], skills: [] } : await getCreatorSignals(ctx, creator);
  return await Promise.all(
    briefs.map(async (brief) => {
      const [application, assignment] = await Promise.all([
        ctx.db
          .query("applications")
          .withIndex("by_opportunityId_and_creatorId", (q) =>
            q.eq("opportunityId", brief._id).eq("creatorId", creatorId),
          )
          .order("desc")
          .first(),
        ctx.db
          .query("assignments")
          .withIndex("by_opportunityId_and_creatorId", (q) =>
            q.eq("opportunityId", brief._id).eq("creatorId", creatorId),
          )
          .order("desc")
          .first(),
      ]);
      return {
        ...brief,
        application: application && { _id: application._id, status: application.status },
        assignment: assignment && { _id: assignment._id, status: assignment.status },
        match: describeMatch(signals, brief),
      };
    }),
  );
}
