import { defineTable } from "convex/server";
import { v, type Infer } from "convex/values";

export const mediaKind = v.union(v.literal("profile-picture"), v.literal("video-submission"));
export type MediaKind = Infer<typeof mediaKind>;

/** A grant belongs to one user and, for videos, one assignment. */
export const mediaUploadsTable = defineTable({
  ownerUserId: v.id("users"),
  kind: mediaKind,
  assignmentId: v.optional(v.id("assignments")),
  stagingKey: v.string(),
  contentType: v.string(),
  grantExpiresAt: v.number(),
  status: v.union(v.literal("pending"), v.literal("complete")),
  permanentKey: v.optional(v.string()),
  sizeBytes: v.optional(v.number()),
});
