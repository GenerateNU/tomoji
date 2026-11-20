import {
  RiBankCardLine,
  RiCalendarCloseLine,
  RiCheckLine,
  RiCloseCircleLine,
  RiEditLine,
  RiErrorWarningLine,
  RiRefundLine,
  RiScales3Line,
  RiUserAddLine,
  RiVideoOnLine,
} from "@remixicon/react";
import type { Doc } from "@convex/_generated/dataModel";
import type { IconComponent } from "@/lib/icons";
import { formatRelativeTime } from "@/lib/relative-time";

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
  payoutDisputed: RiScales3Line,
  payoutDisputeClosed: RiScales3Line,
  payoutRefunded: RiRefundLine,
} satisfies Record<Doc<"notifications">["type"], IconComponent>;

/**
 * The page a notification opens, or null when its target has no page yet.
 * Company events open company queues; creator events open their assignment or application pages.
 */
export function notificationHref(
  target: Doc<"notifications">["target"],
  company = false,
): string | null {
  // The company routes differ from the creator's application and assignment pages.
  if (company) {
    if (target.kind === "submission" || target.kind === "assignment") return "/submissions";
    if (
      target.kind === "application" ||
      target.kind === "opportunity" ||
      target.kind === "campaign"
    )
      return "/campaigns";
    return null;
  }
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

/** Company activity uses relative time, with the prior calendar day labeled Yesterday. */
export function formatCompanyNotificationTime(time: number, now: number): string {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return new Date(time).toDateString() === yesterday.toDateString()
    ? "Yesterday"
    : formatRelativeTime(time, now);
}

/** The unread query stops counting at 100, which reads as "99+". */
export function formatUnreadCount(count: number) {
  return count > 99 ? "99+" : String(count);
}
