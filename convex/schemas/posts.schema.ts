import { defineTable } from "convex/server";
import { v } from "convex/values";

export const postsTable = defineTable({
  submissionId: v.id("submissions"),
  url: v.string(),
  postedAt: v.number(), // Unix milliseconds.
  isVerified: v.boolean(),
  likes: v.optional(v.number()),
  comments: v.optional(v.number()),
  reposts: v.optional(v.number()),
  views: v.optional(v.number()),
  metricsUpdatedAt: v.optional(v.number()), // Unix milliseconds.
}).index("by_submissionId", ["submissionId"]);
