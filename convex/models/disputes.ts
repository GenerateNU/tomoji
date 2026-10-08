import type { PaginationOptions, PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireBoundedText } from "../lib/validation";
import schema from "../schema";
import { requireAssignment, type AssignmentViewer } from "./assignments";

const disputeDoc = schema.doc("disputes");

export const disputeDraft = disputeDoc.pick(
  "assignmentId",
  "submissionId",
  "reason",
  "description",
);
export type DisputeDraft = Infer<typeof disputeDraft>;

/** `openedBy` is optional because creators never get user IDs (see `toCreatorView`). */
export const disputeView = disputeDoc
  .omit("openedBy")
  .extend({ openedBy: v.optional(v.id("users")) });
export type DisputeView = Infer<typeof disputeView>;

const MAX_LENGTH = {
  reason: 200,
  description: 5000,
} as const;

/**
 * Opens a dispute on any assignment the caller can see, whatever its status.
 * Errors are listed on the `disputes.create` route.
 */
export async function createDispute(
  ctx: MutationCtx,
  viewer: AssignmentViewer,
  openedBy: Id<"users">,
  draft: DisputeDraft,
): Promise<Id<"disputes">> {
  const assignment = await requireAssignment(ctx, viewer, draft.assignmentId);
  if (draft.submissionId !== undefined) {
    await requireSubmissionOnAssignment(ctx, draft.submissionId, assignment._id);
  }

  return await ctx.db.insert("disputes", {
    assignmentId: assignment._id,
    submissionId: draft.submissionId,
    openedBy,
    openedByRole: viewer.role,
    reason: requireBoundedText(draft.reason, "reason", MAX_LENGTH.reason),
    description: requireBoundedText(draft.description, "description", MAX_LENGTH.description),
    isResolved: false,
  });
}

async function requireSubmissionOnAssignment(
  ctx: MutationCtx,
  submissionId: Id<"submissions">,
  assignmentId: Id<"assignments">,
): Promise<void> {
  const submission = await ctx.db.get("submissions", submissionId);
  if (submission === null || submission.assignmentId !== assignmentId) {
    throw apiError("not_found", { resource: "submission" });
  }
}

/** One dispute, as the viewer may see it. */
export async function requireDispute(
  ctx: QueryCtx,
  viewer: AssignmentViewer,
  disputeId: Id<"disputes">,
): Promise<DisputeView> {
  const dispute = await ctx.db.get("disputes", disputeId);
  if (dispute === null) throw apiError("not_found", { resource: "dispute" });
  await requireAssignment(ctx, viewer, dispute.assignmentId);
  return toDisputeView(viewer, dispute);
}

/** One page of an assignment's disputes, newest first, as the viewer may see them. */
export async function listDisputes(
  ctx: QueryCtx,
  viewer: AssignmentViewer,
  assignmentId: Id<"assignments">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<DisputeView>> {
  await requireAssignment(ctx, viewer, assignmentId);
  const result = await ctx.db
    .query("disputes")
    .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignmentId))
    .order("desc")
    .paginate(paginationOpts);
  return { ...result, page: result.page.map((dispute) => toDisputeView(viewer, dispute)) };
}

function toDisputeView(viewer: AssignmentViewer, dispute: Doc<"disputes">): DisputeView {
  switch (viewer.role) {
    case "company":
    case "operator":
      return dispute;
    case "creator":
      return toCreatorView(dispute);
  }
}

/**
 * Copies an explicit list of fields rather than removing user IDs, so a field
 * added to the schema later stays hidden from creators until it's added here.
 */
function toCreatorView(dispute: Doc<"disputes">): DisputeView {
  return {
    _id: dispute._id,
    _creationTime: dispute._creationTime,
    assignmentId: dispute.assignmentId,
    submissionId: dispute.submissionId,
    openedByRole: dispute.openedByRole,
    reason: dispute.reason,
    description: dispute.description,
    isResolved: dispute.isResolved,
    resolution: dispute.resolution,
  };
}
