import { defineTable } from "convex/server";
import { v } from "convex/values";

export const postsTable = defineTable({
  submissionId: v.id("submissions"),
  // Denormalized from the assignment so companies can list a campaign's posts
  // by index. It can't change: an assignment never moves campaigns.
  campaignId: v.id("campaigns"),
  url: v.string(),
  // The numeric id from the link. Every post with a given id belongs to one
  // submission, so one X post can't count twice under different link formats.
  xPostId: v.string(),
  // A submission has one active post. Replacing the link deactivates the old
  // post instead of overwriting it, so disputes can still see what was posted.
  isActive: v.boolean(),
  // When the post went live on X, entered by the operator on verification.
  // Submission time is `_creationTime`.
  postedAt: v.optional(v.number()), // Unix milliseconds.
  isVerified: v.boolean(),
  likes: v.optional(v.number()),
  comments: v.optional(v.number()),
  reposts: v.optional(v.number()),
  views: v.optional(v.number()),
  metricsUpdatedAt: v.optional(v.number()), // Unix milliseconds.
})
  .index("by_submissionId_and_isActive", ["submissionId", "isActive"])
  .index("by_campaignId_and_isActive", ["campaignId", "isActive"])
  .index("by_xPostId", ["xPostId"]);
