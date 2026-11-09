import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { scoreCreatorOpportunities, scoreOpportunityForCreators } from "./models/opportunityScores";

const progressArgs = {
  stage: v.optional(v.number()),
  cursor: v.optional(v.union(v.string(), v.null())),
};

/** Scores an opportunity for the creators it could match, or clears its scores once it's hidden. */
export const scoreOpportunity = internalMutation({
  args: { opportunityId: v.id("opportunities"), ...progressArgs },
  returns: v.null(),
  handler: async (ctx, { opportunityId, stage, cursor }) => {
    const progress = await scoreOpportunityForCreators(
      ctx,
      opportunityId,
      stage ?? 0,
      cursor ?? null,
    );
    if (!progress.isDone) {
      await ctx.scheduler.runAfter(0, internal.opportunityScores.scoreOpportunity, {
        opportunityId,
        stage: progress.stage,
        cursor: progress.cursor,
      });
    }
    return null;
  },
});

/** Scores open opportunities for one creator, or clears their scores once they have no feed. */
export const scoreCreator = internalMutation({
  args: { creatorId: v.id("creators"), ...progressArgs },
  returns: v.null(),
  handler: async (ctx, { creatorId, stage, cursor }) => {
    const progress = await scoreCreatorOpportunities(ctx, creatorId, stage ?? 0, cursor ?? null);
    if (!progress.isDone) {
      await ctx.scheduler.runAfter(0, internal.opportunityScores.scoreCreator, {
        creatorId,
        stage: progress.stage,
        cursor: progress.cursor,
      });
    }
    return null;
  },
});
