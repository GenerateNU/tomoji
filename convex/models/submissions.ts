import type { PaginationOptions, PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";
import schema from "../schema";
import { submissionStatus } from "../schemas/submissions.schema";

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

/**
 * A submission as creators see it: the draft and the review outcome, without
 * who reviewed it or any dispute details.
 */
export const creatorSubmission = v.object({
  _id: v.id("submissions"),
  _creationTime: v.number(),
  assignmentId: v.id("assignments"),
  draftUrl: v.string(),
  draftDescription: v.string(),
  status: submissionStatus,
  usesAiReview: v.boolean(),
  reviewNote: v.optional(v.string()),
  reviewerType: v.optional(
    v.union(v.literal("ai"), v.literal("companyUser"), v.literal("operator")),
  ),
  reviewedAt: v.optional(v.number()),
});
export type CreatorSubmission = Infer<typeof creatorSubmission>;

/** What `get` and `list` return: the full row, or the creator shape for creators. */
export const submissionView = v.union(schema.doc("submissions"), creatorSubmission);
export type SubmissionView = Doc<"submissions"> | CreatorSubmission;

/**
 * Who is reading or acting on submissions. Routes resolve it from the caller's
 * auth context, so the model never trusts a client-supplied identity.
 */
export type SubmissionViewer =
  | { role: "creator"; creatorId: Id<"creators"> }
  | { role: "company"; companyId: Id<"companies"> }
  | { role: "operator" };

// TODO(assignments): move this lookup into models/assignments.ts once that
// domain has a model.
/** Returns the company that owns an assignment, via its opportunity and campaign. */
async function getAssignmentCompanyId(
  ctx: QueryCtx | MutationCtx,
  assignment: Doc<"assignments">,
): Promise<Id<"companies"> | null> {
  const opportunity = await ctx.db.get("opportunities", assignment.opportunityId);
  if (opportunity === null) return null;
  const campaign = await ctx.db.get("campaigns", opportunity.campaignId);
  return campaign?.companyId ?? null;
}

/**
 * Returns the assignment if the viewer may see it, or `null` if it doesn't exist
 * or isn't theirs. Creators see their own, companies see theirs, operators see all.
 */
async function getAccessibleAssignment(
  ctx: QueryCtx | MutationCtx,
  viewer: SubmissionViewer,
  assignmentId: Id<"assignments">,
): Promise<Doc<"assignments"> | null> {
  const assignment = await ctx.db.get("assignments", assignmentId);
  if (assignment === null) return null;
  switch (viewer.role) {
    case "operator":
      return assignment;
    case "creator":
      return assignment.creatorId === viewer.creatorId ? assignment : null;
    case "company":
      return (await getAssignmentCompanyId(ctx, assignment)) === viewer.companyId
        ? assignment
        : null;
  }
}

/**
 * Returns the assignment if the viewer may see it.
 *
 * @throws `not_found` if it doesn't exist or isn't theirs, so callers can't tell
 * the two apart.
 */
async function requireAssignmentAccess(
  ctx: QueryCtx | MutationCtx,
  viewer: SubmissionViewer,
  assignmentId: Id<"assignments">,
): Promise<Doc<"assignments">> {
  const assignment = await getAccessibleAssignment(ctx, viewer, assignmentId);
  if (assignment === null) throw apiError("not_found", { resource: "assignment" });
  return assignment;
}

/**
 * Returns the submission and its assignment if the viewer may see them.
 *
 * @throws `not_found` if the submission doesn't exist or isn't theirs. Every case
 * reports the same resource, so callers can't tell which link failed.
 */
async function requireSubmissionAccess(
  ctx: QueryCtx | MutationCtx,
  viewer: SubmissionViewer,
  submissionId: Id<"submissions">,
): Promise<{ submission: Doc<"submissions">; assignment: Doc<"assignments"> }> {
  const notFound = () => apiError("not_found", { resource: "submission" });
  const submission = await ctx.db.get("submissions", submissionId);
  if (submission === null) throw notFound();
  const assignment = await getAccessibleAssignment(ctx, viewer, submission.assignmentId);
  if (assignment === null) throw notFound();
  return { submission, assignment };
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
 * Converts a stored submission to the creator shape. It copies an explicit list
 * of fields, so a field added to the schema later stays hidden from creators
 * until someone adds it here on purpose.
 */
export function toCreatorSubmission(submission: Doc<"submissions">): CreatorSubmission {
  const view: CreatorSubmission = {
    _id: submission._id,
    _creationTime: submission._creationTime,
    assignmentId: submission.assignmentId,
    draftUrl: submission.draftUrl,
    draftDescription: submission.draftDescription,
    status: submission.status,
    usesAiReview: submission.usesAiReview,
  };
  if (submission.status === "pending") return view;
  return {
    ...view,
    reviewNote: submission.reviewNote,
    reviewerType: submission.reviewerType,
    reviewedAt: submission.reviewedAt,
  };
}

/** Returns the shape the viewer is allowed to see. */
function toSubmissionView(
  viewer: SubmissionViewer,
  submission: Doc<"submissions">,
): SubmissionView {
  return viewer.role === "creator" ? toCreatorSubmission(submission) : submission;
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
  const assignment = await requireAssignmentAccess(
    ctx,
    { role: "creator", creatorId },
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
  const { submission, assignment } = await requireSubmissionAccess(
    ctx,
    { role: "company", companyId: membership.companyId },
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

/**
 * Returns one submission in the shape the viewer may see.
 *
 * @throws `not_found` if it doesn't exist or isn't the viewer's.
 */
export async function requireSubmission(
  ctx: QueryCtx,
  viewer: SubmissionViewer,
  submissionId: Id<"submissions">,
): Promise<SubmissionView> {
  const { submission } = await requireSubmissionAccess(ctx, viewer, submissionId);
  return toSubmissionView(viewer, submission);
}

/**
 * Returns one page of an assignment's submissions, newest first, in the shape
 * the viewer may see. Access is checked once, on the assignment.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the viewer's.
 */
export async function listSubmissions(
  ctx: QueryCtx,
  viewer: SubmissionViewer,
  assignmentId: Id<"assignments">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<SubmissionView>> {
  await requireAssignmentAccess(ctx, viewer, assignmentId);
  const result = await ctx.db
    .query("submissions")
    .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignmentId))
    .order("desc")
    .paginate(paginationOpts);
  return { ...result, page: result.page.map((submission) => toSubmissionView(viewer, submission)) };
}
