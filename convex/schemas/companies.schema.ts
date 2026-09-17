import { defineTable } from "convex/server";
import { v } from "convex/values";

export const companiesTable = defineTable({
  workosId: v.string(),
  name: v.string(),
  isActive: v.boolean(),
  profilePicture: v.optional(v.string()),
}).index("by_workosId", ["workosId"]);
