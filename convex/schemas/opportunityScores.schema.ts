import { defineTable } from "convex/server";
import { v } from "convex/values";

/** How well one open opportunity matches one creator's profile, from 0 to 1. Derived data. */
export const opportunityScoresTable = defineTable({
  creatorId: v.id("creators"),
  opportunityId: v.id("opportunities"),
  score: v.number(),
})
  .index("by_creatorId_and_score", ["creatorId", "score"])
  .index("by_creatorId_and_opportunityId", ["creatorId", "opportunityId"])
  .index("by_opportunityId", ["opportunityId"]);
