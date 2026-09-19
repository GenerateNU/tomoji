import { defineTable } from "convex/server";
import { v } from "convex/values";

export const creatorsTable = defineTable({
  userId: v.id("users"),
  xId: v.optional(v.string()),
  githubLink: v.optional(v.string()),
  phoneNumber: v.optional(v.string()),
}).index("by_userId", ["userId"]);

export const creatorProfile = v.object({
  creatorId: v.id("creators"),
  name: v.string(),
  email: v.string(),
  profilePicture: v.optional(v.string()),
  xId: v.optional(v.string()),
  githubLink: v.optional(v.string()),
  phoneNumber: v.optional(v.string()),
});
