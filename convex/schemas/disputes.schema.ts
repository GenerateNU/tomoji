import { defineTable } from "convex/server";
import { v } from "convex/values";
import { userRole } from "./users.schema";

/** Reasons a company can give. Operators may give any reason. */
export const companyDisputeReasons = [
  "missingDisclosure",
  "publishedWithoutApproval",
  "productMisuse",
  "postRemoved",
  "other",
] as const;

/** Reasons a creator can give. Operators may give any reason. */
export const creatorDisputeReasons = [
  "payoutAmount",
  "paymentNotReceived",
  "unfairReview",
  "deadline",
  "other",
] as const;

export const disputeReason = v.union(
  v.literal("missingDisclosure"),
  v.literal("publishedWithoutApproval"),
  v.literal("productMisuse"),
  v.literal("postRemoved"),
  v.literal("payoutAmount"),
  v.literal("paymentNotReceived"),
  v.literal("unfairReview"),
  v.literal("deadline"),
  v.literal("other"),
);

// TODO(disputes): more states (e.g. awaiting response, withdrawn) as the flow grows.
export const disputeStatus = v.union(v.literal("open"), v.literal("resolved"));

export const disputesTable = defineTable({
  assignmentId: v.id("assignments"),
  // Copied from the assignment so the company and creator lists use an index.
  // None of them can change on an assignment.
  companyId: v.id("companies"),
  creatorId: v.id("creators"),
  campaignId: v.id("campaigns"),
  openedBy: v.id("users"),
  // The opener's role, so the side that raised it is known without a user
  // lookup, and creators can see the side without the person.
  openedByRole: userRole,
  reason: disputeReason,
  description: v.string(),
  // What was on file when it was opened, recorded by the server: the
  // assignment's approved submission and its posts. Never changes after.
  evidenceSubmissionIds: v.array(v.id("submissions")),
  evidencePostIds: v.array(v.id("posts")),
  status: disputeStatus,
  resolvedBy: v.optional(v.id("users")),
  resolution: v.optional(v.string()),
})
  .index("by_companyId_and_status", ["companyId", "status"])
  .index("by_companyId_and_status_and_openedByRole", ["companyId", "status", "openedByRole"])
  .index("by_creatorId_and_status", ["creatorId", "status"])
  .index("by_creatorId_and_status_and_openedByRole", ["creatorId", "status", "openedByRole"])
  .index("by_openedBy", ["openedBy"])
  .index("by_resolvedBy", ["resolvedBy"]);
