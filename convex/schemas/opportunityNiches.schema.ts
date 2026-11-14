import { defineTable } from "convex/server";
import { v } from "convex/values";

export const opportunityNichesTable = defineTable({
  opportunityId: v.id("opportunities"),
  name: v.string(),
})
  .index("by_opportunityId", ["opportunityId"])
  .index("by_name_and_opportunityId", ["name", "opportunityId"]);
