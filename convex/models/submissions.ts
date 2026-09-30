import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";

/** The creator-supplied fields of a new submission */
export const submissionDraft = v.object({
  assignmentId: v.id("assignments"),
  draftUrl: v.string(),
  draftDescription: v.string(),
});
export type SubmissionDraft = Infer<typeof submissionDraft>;

/**
 * A review decision.
 */
export const submissionReview = v.union(
  v.object({ status: v.literal("approved"), reviewNote: v.optional(v.string()) }),
  v.object({ status: v.literal("changesRequested"), reviewNote: v.string() }),
);
export type SubmissionReview = Infer<typeof submissionReview>;

/** A submission reviewed by a company user. */
export type CompanyUserReviewedSubmission = Extract<
  Doc<"submissions">,
  { reviewerType: "companyUser" }
>;

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
  // TODO(dueAt): reject after `assignment.dueAt` once assignments have it.
}

// TODO(assignments): move the assignment → opportunity → campaign lookup into
// models/assignments.ts once that domain has a model.
/**
 * Returns the submission and its assignment if the submission belongs to the
 * company, following submission → assignment → opportunity → campaign.
 *
 * @throws `not_found` if any link is missing or the campaign belongs to another
 * company, so callers can't tell the cases apart.
 */
async function requireCompanySubmission(
  ctx: QueryCtx | MutationCtx,
  companyId: Id<"companies">,
  submissionId: Id<"submissions">,
): Promise<{ submission: Doc<"submissions">; assignment: Doc<"assignments"> }> {
  const notFound = () => apiError("not_found", { resource: "submission" });

  const submission = await ctx.db.get("submissions", submissionId);
  if (submission === null) throw notFound();
  const assignment = await ctx.db.get("assignments", submission.assignmentId);
  if (assignment === null) throw notFound();
  const opportunity = await ctx.db.get("opportunities", assignment.opportunityId);
  if (opportunity === null) throw notFound();
  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  if (campaign === null || campaign.companyId !== companyId) throw notFound();

  return { submission, assignment };
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
  const assignment = await requireCreatorAssignment(ctx, creatorId, draft.assignmentId);
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
    draftDescription: requireNonBlank(draft.draftDescription, "draftDescription"),
    status: "pending",
    usesAiReview: assignment.usesAiReview,
  });
}

/**
 * Records a company user's review of a pending submission from their company.
 * Reviews are final: only a `pending` submission can be reviewed.
 *
 * @throws `not_found` if the submission doesn't exist or isn't the company's.
 * @throws `invalid_state` if it was already reviewed, the assignment isn't
 * active, or the review note is blank.
 * @returns the reviewed submission as stored.
 */
export async function reviewSubmission(
  ctx: MutationCtx,
  membership: Doc<"companyUsers">,
  submissionId: Id<"submissions">,
  review: SubmissionReview,
): Promise<CompanyUserReviewedSubmission> {
  const { submission, assignment } = await requireCompanySubmission(
    ctx,
    membership.companyId,
    submissionId,
  );
  if (submission.status !== "pending") {
    throw apiError("invalid_state", { reason: "already_reviewed" });
  }
  // The assignment may have been cancelled or completed while the draft waited.
  if (assignment.status !== "active") {
    throw apiError("invalid_state", { reason: "assignment_not_active" });
  }
  // TODO(ai-layer): reject when `submission.usesAiReview` is true. Until the AI
  // layer exists, company users review every submission.

  const patch = {
    status: review.status,
    // The validator requires a note for `changesRequested` - this rejects blank ones.
    reviewNote:
      review.reviewNote === undefined
        ? undefined
        : requireNonBlank(review.reviewNote, "reviewNote"),
    reviewerType: "companyUser" as const,
    reviewedBy: membership._id,
    reviewedAt: Date.now(),
  };
  await ctx.db.patch("submissions", submissionId, patch);
  return { ...submission, ...patch };
}
