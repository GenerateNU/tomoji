import { defineTable } from "convex/server";
import { v } from "convex/values";

export const applicationStatus = v.union(
  v.literal("pending"),
  v.literal("offered"),
  v.literal("accepted"),
  v.literal("declined"),
  v.literal("rejected"),
  v.literal("offerExpired"),
  v.literal("opportunityFull"),
);

export const applicationsTable = defineTable({
  opportunityId: v.id("opportunities"),
  creatorId: v.id("creators"),
  note: v.string(),
  status: applicationStatus,
  offerSentAt: v.optional(v.number()), // Unix milliseconds.
  offerExpiresAt: v.optional(v.number()), // Unix milliseconds.
  offerAcceptedAt: v.optional(v.number()), // Unix milliseconds.
})
  .index("by_opportunityId_and_creatorId", ["opportunityId", "creatorId"])
  .index("by_opportunityId_and_status", ["opportunityId", "status"])
  .index("by_creatorId_and_status", ["creatorId", "status"])
  .index("by_status_and_offerExpiresAt", ["status", "offerExpiresAt"]);
