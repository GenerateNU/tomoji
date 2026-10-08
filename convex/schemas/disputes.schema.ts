import { defineTable } from "convex/server";
import { v } from "convex/values";
import { userRole } from "./users.schema";

export const disputesTable = defineTable({
  assignmentId: v.id("assignments"),
  // Set when the dispute is about one submission's review. Always a submission
  // on `assignmentId`; `disputes.create` checks this.
  submissionId: v.optional(v.id("submissions")),
  openedBy: v.id("users"),
  // The opener's role when they opened it, so the side that raised it is known
  // without a user lookup, and creators can see the side without the person.
  openedByRole: userRole,
  reason: v.string(),
  description: v.string(),
  // TODO(disputes): may become a status union (e.g. open | resolved | withdrawn);
  // under team review.
  isResolved: v.boolean(),
  resolvedBy: v.optional(v.id("users")),
  resolution: v.optional(v.string()),
})
  .index("by_assignmentId", ["assignmentId"])
  .index("by_openedBy", ["openedBy"])
  .index("by_resolvedBy", ["resolvedBy"]);
