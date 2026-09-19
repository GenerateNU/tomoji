import { defineTable } from "convex/server";
import { v } from "convex/values";

export const userRole = v.union(v.literal("creator"), v.literal("company"), v.literal("operator"));

export const usersTable = defineTable({
  workosId: v.string(),
  name: v.string(),
  email: v.string(),
  role: userRole,
  isActive: v.boolean(),
  profilePicture: v.optional(v.string()),
})
  .index("by_workosId", ["workosId"])
  .index("by_role", ["role"]);
