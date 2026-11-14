import type { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";

type AiReview = NonNullable<FunctionReturnType<typeof api.submissions.get>["aiReview"]>;

export const aiReviewStatusLabel = {
  ready: "Queued for AI review",
  transcribing: "Transcribing video",
  evaluating: "Checking the draft against the brief",
  manualReview: "Waiting for a human reviewer",
  completed: "AI review complete",
} satisfies Record<AiReview["status"], string>;

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
