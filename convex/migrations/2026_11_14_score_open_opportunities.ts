import { internal } from "../_generated/api";
import { migrations } from "./runner";

/**
 * Scores briefs published before scoring existed, one background job each,
 * as publishing would. That also covers every creator, since scoring a brief
 * reaches each creator who shares one of its selections.
 */
export const scoreOpenOpportunities = migrations.define({
  table: "opportunities",
  migrateOne: async (ctx, opportunity) => {
    if (opportunity.status !== "open" && opportunity.status !== "paused") return;
    await ctx.scheduler.runAfter(0, internal.opportunityScores.scoreOpportunity, {
      opportunityId: opportunity._id,
    });
  },
});
