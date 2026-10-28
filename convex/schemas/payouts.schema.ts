import { defineTable } from "convex/server";
import { v } from "convex/values";

export const payoutApprovalStatus = v.union(v.literal("pending"), v.literal("approved"));
export const payoutApprovalSource = v.union(v.literal("company"), v.literal("automatic"));
export const payoutPaymentStatus = v.union(
  v.literal("notStarted"),
  v.literal("queued"),
  v.literal("processing"),
  v.literal("needsAttention"),
  v.literal("transferred"),
);

/** An earned payment obligation, separate from payment-provider attempts and bank payouts. */
export const payoutsTable = defineTable({
  assignmentId: v.id("assignments"),
  // Copied from the assignment. History remains scoped even if its parents disappear.
  creatorId: v.id("creators"),
  companyId: v.id("companies"),
  campaignId: v.id("campaigns"),
  // Internal earning-event key; future writers enforce uniqueness within the assignment.
  sourceKey: v.string(),
  postId: v.optional(v.id("posts")),
  earningPeriod: v.optional(v.object({ startsAt: v.number(), endsAt: v.number() })),
  // Integer minor units and lowercase currency code. Future writers validate money bounds.
  amountCents: v.number(),
  currency: v.string(),
  reviewRequestedAt: v.number(), // Unix milliseconds.
  approvalDueAt: v.number(), // Unix milliseconds; future approval workflow enforces the deadline.
  approvalStatus: payoutApprovalStatus,
  approvedAt: v.optional(v.number()),
  approvalSource: v.optional(payoutApprovalSource),
  approvedBy: v.optional(v.id("users")),
  paymentStatus: payoutPaymentStatus,
  // Transfer to the creator's provider balance, not confirmation of a bank payout.
  transferredAt: v.optional(v.number()),
})
  .index("by_creatorId_and_reviewRequestedAt", ["creatorId", "reviewRequestedAt"])
  .index("by_creatorId_and_approvalStatus_and_reviewRequestedAt", [
    "creatorId",
    "approvalStatus",
    "reviewRequestedAt",
  ])
  .index("by_companyId_and_reviewRequestedAt", ["companyId", "reviewRequestedAt"])
  .index("by_companyId_and_approvalStatus_and_reviewRequestedAt", [
    "companyId",
    "approvalStatus",
    "reviewRequestedAt",
  ])
  .index("by_assignmentId_and_reviewRequestedAt", ["assignmentId", "reviewRequestedAt"])
  .index("by_assignmentId_and_approvalStatus_and_reviewRequestedAt", [
    "assignmentId",
    "approvalStatus",
    "reviewRequestedAt",
  ])
  .index("by_campaignId_and_reviewRequestedAt", ["campaignId", "reviewRequestedAt"])
  .index("by_campaignId_and_approvalStatus_and_reviewRequestedAt", [
    "campaignId",
    "approvalStatus",
    "reviewRequestedAt",
  ])
  .index("by_reviewRequestedAt", ["reviewRequestedAt"])
  .index("by_approvalStatus_and_reviewRequestedAt", ["approvalStatus", "reviewRequestedAt"])
  .index("by_assignmentId_and_sourceKey", ["assignmentId", "sourceKey"])
  .index("by_approvalStatus_and_approvalDueAt", ["approvalStatus", "approvalDueAt"]);
