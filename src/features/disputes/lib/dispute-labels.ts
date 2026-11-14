import type { FunctionReturnType } from "convex/server";
import type { Infer } from "convex/values";
import { RiArrowGoBackLine, RiCheckLine, RiCloseLine, RiTimeLine } from "@remixicon/react";
import type { api } from "@convex/_generated/api";
import type { disputeReason } from "@convex/schemas/disputes.schema";
import type { IconComponent } from "@/lib/icons";

export type DisputeView = FunctionReturnType<typeof api.disputes.get>;
type DisputeReason = Infer<typeof disputeReason>;

// A dispute has no title of its own; its reason stands in for one. Company
// reasons are listed too, because creators also see disputes a company opened.
const REASON_LABELS: Record<DisputeReason, string> = {
  payoutAmount: "Incorrect payout amount",
  paymentNotReceived: "Payment not received",
  unfairReview: "Unfair submission review",
  deadline: "Deadline issue",
  missingDisclosure: "Missing disclosure",
  publishedWithoutApproval: "Published without approval",
  productMisuse: "Product misuse",
  postRemoved: "Post removed",
  other: "Other",
};

/** The dispute's title: the opener's own words for "other", else the reason's label. */
export function disputeTitle(dispute: Pick<DisputeView, "reason" | "customReason">): string {
  return dispute.reason === "other" && dispute.customReason
    ? dispute.customReason
    : REASON_LABELS[dispute.reason];
}

type DisputeStatus = { label: string; icon: IconComponent };

/** Open disputes are under review; resolved ones show how they ended. */
export function disputeStatus(dispute: DisputeView): DisputeStatus {
  if (dispute.status === "open") return { label: "Under Review", icon: RiTimeLine };
  switch (dispute.outcome) {
    case "approved":
      return { label: "Approved", icon: RiCheckLine };
    case "denied":
      return { label: "Denied", icon: RiCloseLine };
    case "withdrawn":
      return { label: "Withdrawn", icon: RiArrowGoBackLine };
  }
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
});

/** "November 11, 2026". */
export function formatDisputeDate(timestamp: number): string {
  return dateFormat.format(timestamp);
}
