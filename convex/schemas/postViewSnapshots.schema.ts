import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Immutable evidence supplied by trusted metric collection, including observation time. */
export const postViewSnapshotsTable = defineTable({
  postId: v.id("posts"),
  observedAt: v.number(),
  views: v.number(),
  sourceKey: v.string(),
  receivedAt: v.number(),
})
  .index("by_postId_and_sourceKey", ["postId", "sourceKey"])
  .index("by_postId_and_observedAt", ["postId", "observedAt"]);
