import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";

export type SubmissionQueueRow = FunctionReturnType<
  typeof api.submissions.listCompanyQueue
>["rows"][number];

export const labels = {
  all: "All",
  pending: "Needs review",
  changesRequested: "Changes requested",
  approved: "Approved",
} as const;
