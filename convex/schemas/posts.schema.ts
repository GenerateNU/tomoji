import { defineTable } from "convex/server";
import { v } from "convex/values";

export const postsTable = defineTable({
  submissionId: v.id("submissions"),
  url: v.string(),
  postedAt: v.number(), // Unix milliseconds.
  isVerified: v.boolean(),
  likes: v.number(),
  comments: v.number(),
  reposts: v.number(),
  views: v.number(),
  lastUpdatedAt: v.number(), // Unix milliseconds.
}).index("by_submissionId", ["submissionId"]);
