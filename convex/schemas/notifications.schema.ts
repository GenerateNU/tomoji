import { defineTable } from "convex/server";
import { v, type Infer } from "convex/values";

export const notificationType = v.union(
  // To creators
  v.literal("applicationOffered"),
  v.literal("applicationRejected"),
  v.literal("applicationOpportunityFull"),
  v.literal("applicationOpportunityClosed"),
  v.literal("assignmentCancelled"),
  v.literal("submissionApproved"),
  v.literal("submissionChangesRequested"),
  // To the company member who created the opportunity or campaign
  v.literal("applicationReceived"),
  v.literal("applicationAccepted"),
  v.literal("applicationDeclined"),
  v.literal("assignmentClaimed"),
  v.literal("assignmentTermsAccepted"),
  v.literal("assignmentTermsDeclined"),
  v.literal("submissionCreated"),
  v.literal("submissionResubmitted"),
  v.literal("opportunityClosed"), // Deadline cron only.
  v.literal("campaignClosed"), // End-date cron only.
  v.literal("applicationOfferExpired"),
);

// What clicking the notification opens. IDs rather than URLs, so the client
// maps each kind to a route for the viewer's role and links survive route changes.
export const notificationTarget = v.union(
  v.object({
    kind: v.literal("application"),
    applicationId: v.id("applications"),
    opportunityId: v.id("opportunities"),
  }),
  v.object({ kind: v.literal("assignment"), assignmentId: v.id("assignments") }),
  v.object({
    kind: v.literal("submission"),
    submissionId: v.id("submissions"),
    assignmentId: v.id("assignments"),
  }),
  v.object({ kind: v.literal("opportunity"), opportunityId: v.id("opportunities") }),
  v.object({ kind: v.literal("campaign"), campaignId: v.id("campaigns") }),
);

/**
 * The target kind each notification type opens. `satisfies` makes adding a
 * type without a kind a type error, and `NotificationContent` uses this map so
 * every caller must pass the matching target.
 */
export const notificationTargetKind = {
  applicationOffered: "application",
  applicationRejected: "application",
  applicationOpportunityFull: "application",
  applicationOpportunityClosed: "application",
  assignmentCancelled: "assignment",
  submissionApproved: "submission",
  submissionChangesRequested: "submission",
  applicationReceived: "application",
  applicationAccepted: "assignment", // Opens the assignment the acceptance created.
  applicationDeclined: "application",
  assignmentClaimed: "assignment",
  assignmentTermsAccepted: "assignment",
  assignmentTermsDeclined: "assignment",
  submissionCreated: "submission",
  submissionResubmitted: "submission",
  opportunityClosed: "opportunity",
  campaignClosed: "campaign",
  applicationOfferExpired: "application",
} as const satisfies Record<
  Infer<typeof notificationType>,
  Infer<typeof notificationTarget>["kind"]
>;

export const notificationsTable = defineTable({
  userId: v.id("users"), // Recipient.
  type: notificationType,
  // Rendered when created, so listing needs no joins. Later renames don't rewrite history.
  title: v.string(),
  body: v.optional(v.string()),
  target: notificationTarget,
  isRead: v.boolean(),
})
  .index("by_userId", ["userId"])
  .index("by_userId_and_isRead", ["userId", "isRead"]);
