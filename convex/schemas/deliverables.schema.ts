import { defineTable } from "convex/server";
import { v } from "convex/values";
import { reviewCriterion } from "../lib/ai/validation";

/** One piece of content an opportunity asks every assigned creator to make. */
export const deliverablesTable = defineTable({
  opportunityId: v.id("opportunities"),
  createdBy: v.id("companyUsers"),
  title: v.string(),
  description: v.string(),
  // TODO(#177/#178): align confirmed criteria storage with the pending brief/schema changes.
  reviewCriteria: v.optional(v.array(reviewCriterion)),
}) // The index ends in `_creationTime`, so deliverables list in the order they were added.
  .index("by_opportunityId", ["opportunityId"]);
