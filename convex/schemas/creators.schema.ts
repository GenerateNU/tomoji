import { defineTable } from "convex/server";
import { v } from "convex/values";

export const creatorProfileUpdate = v.object({
  xId: v.optional(v.union(v.string(), v.null())),
  githubLink: v.optional(v.union(v.string(), v.null())),
  phoneNumber: v.optional(v.union(v.string(), v.null())),
});

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
