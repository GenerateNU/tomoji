import { defineTable } from "convex/server";
import { v } from "convex/values";

export const postCaptionCheck = v.union(
  v.literal("match"),
  v.literal("mismatch"),
  v.literal("manualReview"),
);

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
  // When the post went live on X, recorded on verification.
  // Submission time is `_creationTime`.
  postedAt: v.optional(v.number()), // Unix milliseconds.
  // Preserved when verification is revoked; publication time is not an earnings clock.
  firstVerifiedAt: v.optional(v.number()),
  // Set on genuinely new posts; replacements inherit it without certifying legacy history.
  earningsTrackingVersion: v.optional(v.literal(1)),
  // Legacy verification without a recorded time cannot be treated as a fresh agreement.
  earningsTimingUnknown: v.optional(v.boolean()),
  removedAt: v.optional(v.number()),
  removalSourceKey: v.optional(v.string()),
  isVerified: v.boolean(),
  captionCheck: v.optional(postCaptionCheck),
  // Reserves a short window for an in-flight X read and bounds retries.
  captionCheckStartedAt: v.optional(v.number()),
  // What payouts are based on, kept apart from engagement so analytics-only
  // counts can never hold it back.
  views: v.optional(v.number()),
  viewsUpdatedAt: v.optional(v.number()), // Unix milliseconds.
  // Engagement from X, for analytics only. Quote posts are their own count,
  // never added to `reposts`.
  likes: v.optional(v.number()),
  comments: v.optional(v.number()),
  reposts: v.optional(v.number()),
  quotes: v.optional(v.number()),
})
  .index("by_submissionId_and_isActive", ["submissionId", "isActive"])
  .index("by_campaignId_and_isActive", ["campaignId", "isActive"])
  .index("by_xPostId", ["xPostId"])
  // The daily X sync reads verified, active posts by how long ago they went live.
  .index("by_isVerified_and_isActive_and_postedAt", ["isVerified", "isActive", "postedAt"]);
