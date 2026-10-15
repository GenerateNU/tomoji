import { defineTable } from "convex/server";
import { v } from "convex/values";

/** A creator's bookmark on an opportunity, so they can come back to it. */
export const opportunityStarsTable = defineTable({
  creatorId: v.id("creators"),
  opportunityId: v.id("opportunities"),
})
  // Convex indexes are not unique; starOpportunity checks this before inserting.
  .index("by_creatorId_and_opportunityId", ["creatorId", "opportunityId"])
  // Ends in _creationTime, so the starred list can show the most recent first.
  .index("by_creatorId", ["creatorId"]);
