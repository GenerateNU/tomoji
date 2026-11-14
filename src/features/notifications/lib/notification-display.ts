import {
  RiBankCardLine,
  RiCalendarCloseLine,
  RiCheckLine,
  RiCloseCircleLine,
  RiEditLine,
  RiErrorWarningLine,
  RiScales3Line,
  RiUserAddLine,
  RiVideoOnLine,
} from "@remixicon/react";
import type { Doc } from "@convex/_generated/dataModel";
import type { IconComponent } from "@/lib/icons";

/** The icon that names each notification's event, per the Activity Item guidance. */
export const NOTIFICATION_ICONS = {
  applicationOffered: RiCheckLine,
  applicationRejected: RiCloseCircleLine,
  applicationOpportunityFull: RiCloseCircleLine,
  applicationOpportunityClosed: RiCloseCircleLine,
  assignmentCancelled: RiCloseCircleLine,
  submissionApproved: RiCheckLine,
  submissionChangesRequested: RiEditLine,
  applicationReceived: RiUserAddLine,
  applicationAccepted: RiCheckLine,
  applicationDeclined: RiCloseCircleLine,
  assignmentClaimed: RiVideoOnLine,
  assignmentTermsAccepted: RiCheckLine,
  assignmentTermsDeclined: RiCloseCircleLine,
  submissionCreated: RiVideoOnLine,
  submissionResubmitted: RiVideoOnLine,
  opportunityClosed: RiCalendarCloseLine,
  campaignClosed: RiCalendarCloseLine,
  applicationOfferExpired: RiCloseCircleLine,
  disputeOpened: RiScales3Line,
  disputeResolved: RiScales3Line,
  disputeOverridden: RiScales3Line,
  payoutPaymentFailed: RiBankCardLine,
  payoutStripeSetupNeeded: RiBankCardLine,
  payoutChargedTwice: RiErrorWarningLine,
} satisfies Record<Doc<"notifications">["type"], IconComponent>;

/**
 * The page a notification opens, or null when its target has no page yet.
 * Routes don't encode the viewer's role; each page decides what to show.
 */
export function notificationHref(target: Doc<"notifications">["target"]): string | null {
  switch (target.kind) {
    case "application":
      return "/applications";
    case "assignment":
    case "submission":
      return `/assignments/${target.assignmentId}`;
    case "opportunity":
      return "/opportunities";
    case "campaign":
      return "/campaigns";
    case "dispute":
      return null;
  }
}

/** Formats a creation time like Figma's "Nov 11 at 9:12pm", adding the year when it isn't this year's. */
export function formatNotificationTime(time: number, now = new Date()) {
  const date = new Date(time);
  const day = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
  const clock = date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(/\s/g, "")
    .toLowerCase();
  return `${day} at ${clock}`;
}

/** The unread query stops counting at 100, which reads as "99+". */
export function formatUnreadCount(count: number) {
  return count > 99 ? "99+" : String(count);
}
