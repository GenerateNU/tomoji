import { defineTable } from "convex/server";
import { v } from "convex/values";

export const creatorsTable = defineTable({
  userId: v.id("users"),
  username: v.optional(v.string()),
  xId: v.optional(v.string()),
  githubLink: v.optional(v.string()),
  phoneNumber: v.optional(v.string()),
})
  .index("by_userId", ["userId"])
  .index("by_username", ["username"]);
