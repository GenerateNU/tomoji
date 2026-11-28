import type { Doc } from "@convex/_generated/dataModel";

export type ApplicationStatus = Doc<"applications">["status"];

/** What a creator sees for each status. */
export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  pending: "Submitted",
  offered: "Offer received",
  accepted: "Accepted",
  declined: "Declined",
  rejected: "Rejected",
  offerExpired: "Offer expired",
  opportunityFull: "Opportunity full",
};

/**
 * The Applications tab that lists an application in each status. Mirrors the
 * server's `APPLICATION_TAB_STATUSES`; a test keeps the two in step.
 */
const TAB_BY_STATUS = {
  pending: "applications",
  rejected: "applications",
  opportunityFull: "applications",
  offered: "offers",
  offerExpired: "offers",
  declined: "offers",
  accepted: "accepted",
} as const satisfies Record<ApplicationStatus, string>;

export function applicationTab(status: ApplicationStatus) {
  return TAB_BY_STATUS[status];
}
