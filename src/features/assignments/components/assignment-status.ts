import type { Doc } from "@convex/_generated/dataModel";

export const assignmentStatusLabel = {
  termsPending: "Terms pending",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
} satisfies Record<Doc<"assignments">["status"], string>;

export const submissionStatusLabel = {
  pending: "In review",
  approved: "Approved",
  changesRequested: "Changes requested",
} satisfies Record<Doc<"submissions">["status"], string>;
