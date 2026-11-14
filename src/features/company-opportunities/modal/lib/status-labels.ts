import type { Doc } from "@convex/_generated/dataModel";
import type { PaginationStatus } from "convex/react";

type StatusTag = { label: string; tone: "primary" | "neutral" | "destructive" };

const APPLICATION: Record<Doc<"applications">["status"], StatusTag> = {
  // Figma's "Needs review": the only status waiting on the company.
  pending: { label: "Needs review", tone: "primary" },
  offered: { label: "Offer sent", tone: "neutral" },
  accepted: { label: "Accepted", tone: "neutral" },
  declined: { label: "Declined", tone: "neutral" },
  rejected: { label: "Rejected", tone: "neutral" },
  offerExpired: { label: "Offer expired", tone: "neutral" },
  opportunityFull: { label: "Opportunity full", tone: "neutral" },
};

const ASSIGNMENT: Record<Doc<"assignments">["status"], StatusTag> = {
  termsPending: { label: "Reviewing terms", tone: "neutral" },
  active: { label: "Active", tone: "primary" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "destructive" },
};

export function applicationStatusTag(status: Doc<"applications">["status"]): StatusTag {
  return APPLICATION[status];
}

export function assignmentStatusTag(status: Doc<"assignments">["status"]): StatusTag {
  return ASSIGNMENT[status];
}

/**
 * A tab count from a paginated list: exact once every page is loaded, "25+"
 * while more remain, and nothing before the first page arrives. The backend
 * keeps no totals, so this is the honest version of Figma's counts.
 */
export function countLabel(loaded: number, status: PaginationStatus): string | undefined {
  if (status === "LoadingFirstPage") return undefined;
  return status === "Exhausted" ? String(loaded) : `${loaded}+`;
}
