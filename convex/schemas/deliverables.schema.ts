import { defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * One piece of content an opportunity asks every assigned creator to make.
 * Frozen once the opportunity has an assignment, so the work a creator agreed
 * to never changes under them.
 */
export const deliverablesTable = defineTable({
  opportunityId: v.id("opportunities"),
  createdBy: v.id("companyUsers"),
  title: v.string(),
  description: v.string(),
  // The index ends in `_creationTime`, so deliverables list in the order they were added.
}).index("by_opportunityId", ["opportunityId"]);
