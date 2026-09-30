import { v, type Infer } from "convex/values";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";

/** The creator-supplied fields of a new submission */
export const submissionDraft = v.object({
  assignmentId: v.id("assignments"),
  draftUrl: v.string(),
  draftDescription: v.string(),
});
export type SubmissionDraft = Infer<typeof submissionDraft>;

// TODO(assignments): move into models/assignments.ts once that domain has a model.
/**
 * Returns the assignment if it belongs to the creator.
 *
 * @throws `not_found` if it doesn't exist or belongs to someone else, so callers
 * can't tell the two apart.
 */
async function requireCreatorAssignment(
  ctx: QueryCtx | MutationCtx,
  creatorId: Id<"creators">,
  assignmentId: Id<"assignments">,
): Promise<Doc<"assignments">> {
  const assignment = await ctx.db.get("assignments", assignmentId);
  if (assignment === null || assignment.creatorId !== creatorId) {
    throw apiError("not_found", { resource: "assignment" });
  }
  return assignment;
}

/**
 * Validation logic for assignment active state based on deadline.
 *
 * @throws `invalid_state` with reason `assignment_not_active`.
 */
function requireSubmissionWindowOpen(assignment: Doc<"assignments">): void {
  if (assignment.status !== "active") {
    throw apiError("invalid_state", { reason: "assignment_not_active" });
  }
  // TODO: reject after `assignment.deadline` once assignments have it.
}

/**
 * Returns the assignment's newest submission, or `null` if it has none.
 * Indexes end in `_creationTime`, so descending order reads the newest row first.
 */
async function getLatestSubmission(
  ctx: QueryCtx | MutationCtx,
  assignmentId: Id<"assignments">,
): Promise<Doc<"submissions"> | null> {
  return await ctx.db
    .query("submissions")
    .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignmentId))
    .order("desc")
    .first();
}

/**
 * Returns the trimmed draft URL.
 *
 * @throws `invalid_state` with reason `draftUrl_blank` or `draftUrl_invalid`.
 */
function requireDraftUrl(value: string): string {
  const trimmed = requireNonBlank(value, "draftUrl");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw apiError("invalid_state", { reason: "draftUrl_invalid" });
  }
  // Only web links: rejects `javascript:`, `data:`, `ftp:`, and similar schemes.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw apiError("invalid_state", { reason: "draftUrl_invalid" });
  }
  return trimmed;
}

/**
 * Submits a creator's draft for review on their own active assignment.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the creator's.
 * @throws `invalid_state` if the assignment isn't active, a draft is already
 * approved, or a draft field is blank or the URL isn't http(s).
 * @throws `conflict` if a draft is already pending review.
 * @returns the new submission's id.
 */
export async function createSubmission(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  draft: SubmissionDraft,
): Promise<Id<"submissions">> {
  const assignment = await requireCreatorAssignment(
    ctx,
    creatorId,
    draft.assignmentId,
  );
  requireSubmissionWindowOpen(assignment);

  const latest = await getLatestSubmission(ctx, assignment._id);
  if (latest?.status === "pending") {
    throw apiError("conflict", { reason: "submission_pending" });
  }
  if (latest?.status === "approved") {
    throw apiError("invalid_state", { reason: "already_approved" });
  }

  return await ctx.db.insert("submissions", {
    assignmentId: assignment._id,
    draftUrl: requireDraftUrl(draft.draftUrl),
    draftDescription: requireNonBlank(
      draft.draftDescription,
      "draftDescription",
    ),
    status: "pending",
    usesAiReview: assignment.usesAiReview,
  });
}
