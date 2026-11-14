import type { Doc } from "@convex/_generated/dataModel";

export type ApplicationStatus = Doc<"applications">["status"];

/** What a creator sees for each status. */
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "In review",
  offered: "Offer received",
  accepted: "Accepted",
  declined: "Declined",
  rejected: "Rejected",
  offerExpired: "Offer expired",
  opportunityFull: "Opportunity full",
};

/** Filter options, ordered from still-active to finished. */
export const APPLICATION_STATUS_OPTIONS: readonly ApplicationStatus[] = [
  "pending",
  "offered",
  "accepted",
  "declined",
  "rejected",
  "offerExpired",
  "opportunityFull",
];
