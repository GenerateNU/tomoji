import type { PaginationOptions, PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";
import { submissionStatus } from "../schemas/submissions.schema";

// --- Validators and types ---

/** The creator-supplied fields of a new submission */
export const submissionDraft = v.object({
  assignmentId: v.id("assignments"),
  draftUrl: v.string(),
  draftDescription: v.string(),
});
export type SubmissionDraft = Infer<typeof submissionDraft>;

/** A review decision. A note is required when requesting changes. */
export const submissionReview = v.union(
  v.object({ status: v.literal("approved"), reviewNote: v.optional(v.string()) }),
  v.object({ status: v.literal("changesRequested"), reviewNote: v.string() }),
);
export type SubmissionReview = Infer<typeof submissionReview>;

export type CompanyUserReviewedSubmission = Extract<
  Doc<"submissions">,
  { reviewerType: "companyUser" }
>;

/**
 * A submission as creators see it: the draft and the review outcome, without
 * who reviewed it or any dispute details. Creator routes return this validator,
 * so Convex rejects any response that carries an extra field.
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

/**
 * Who is reading or acting on submissions. Routes resolve it from the caller's
 * auth context, so the model never trusts a client-supplied identity.
 */
export type SubmissionViewer =
  | { role: "creator"; creatorId: Id<"creators"> }
  | { role: "company"; companyId: Id<"companies"> }
  | { role: "operator" };

// --- Input validation ---

// Upper bounds on free text, measured after trimming. They keep documents and
// list pages small; `.length` counts UTF-16 units, so an emoji counts as two.
const MAX_LENGTH = {
  draftUrl: 2048,
  draftDescription: 5000,
  reviewNote: 2000,
} as const;

/**
 * Returns `value` trimmed.
 *
 * @throws `invalid_state` with reason `<field>_blank` or `<field>_too_long`.
 */
function requireText(value: string, field: keyof typeof MAX_LENGTH): string {
  const trimmed = requireNonBlank(value, field);
  if (trimmed.length > MAX_LENGTH[field]) {
    throw apiError("invalid_state", { reason: `${field}_too_long` });
  }
  return trimmed;
}

/**
 * Returns the trimmed draft URL.
 *
 * @throws `invalid_state` with reason `draftUrl_blank`, `draftUrl_too_long`, or
 * `draftUrl_invalid`.
 */
function requireDraftUrl(value: string): string {
  const trimmed = requireText(value, "draftUrl");
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

// --- Access ---

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
 * Returns the assignment if the viewer may see it: creators their own,
 * companies theirs, operators all.
 *
 * Access is granted only by a matching case; anything else falls through to
 * the throw, so a role added later sees nothing until it is handled here.
 *
 * @throws `not_found` for `resource` if it doesn't exist or isn't theirs, so
 * callers can't tell the two apart.
 */
async function requireAssignmentAccess(
  ctx: QueryCtx | MutationCtx,
  viewer: SubmissionViewer,
  assignmentId: Id<"assignments">,
  resource: "assignment" | "submission" = "assignment",
): Promise<Doc<"assignments">> {
  const assignment = await ctx.db.get("assignments", assignmentId);
  if (assignment !== null) {
    switch (viewer.role) {
      case "operator":
        return assignment;
      case "creator":
        if (assignment.creatorId === viewer.creatorId) return assignment;
        break;
      case "company":
        if ((await getAssignmentCompanyId(ctx, assignment)) === viewer.companyId) return assignment;
        break;
    }
  }
  throw apiError("not_found", { resource });
}

/**
 * Returns the submission and its assignment if the viewer may see them.
 *
 * @throws `not_found` for `submission` whichever link fails, so callers can't
 * tell a missing submission from someone else's.
 */
async function requireSubmissionAccess(
  ctx: QueryCtx | MutationCtx,
  viewer: SubmissionViewer,
  submissionId: Id<"submissions">,
): Promise<{ submission: Doc<"submissions">; assignment: Doc<"assignments"> }> {
  const submission = await ctx.db.get("submissions", submissionId);
  if (submission === null) throw apiError("not_found", { resource: "submission" });
  const assignment = await requireAssignmentAccess(
    ctx,
    viewer,
    submission.assignmentId,
    "submission",
  );
  return { submission, assignment };
}

// --- Creator shape ---

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

// --- Writes ---

/**
 * Throws unless the creator may submit a draft on this assignment right now.
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
 * Submits a creator's draft for review on their own active assignment.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the creator's.
 * @throws `invalid_state` if the assignment isn't active, a draft is already
 * approved, or a draft field is blank, too long, or the URL isn't http(s).
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
    draftDescription: requireText(draft.draftDescription, "draftDescription"),
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
 * active, or the review note is blank or too long.
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
      review.reviewNote === undefined ? undefined : requireText(review.reviewNote, "reviewNote"),
    reviewerType: "companyUser" as const,
    reviewedBy: membership._id,
    reviewedAt: Date.now(),
  };
  await ctx.db.patch("submissions", submissionId, patch);
  return { ...submission, ...patch };
}

// --- Reads ---
// `requireSubmission` and `listSubmissions` return rows as stored. Creator
// routes use the `…CreatorSubmission(s)` versions, which return the creator shape.

/** @throws `not_found` if the submission doesn't exist or isn't the viewer's. */
export async function requireSubmission(
  ctx: QueryCtx,
  viewer: SubmissionViewer,
  submissionId: Id<"submissions">,
): Promise<Doc<"submissions">> {
  const { submission } = await requireSubmissionAccess(ctx, viewer, submissionId);
  return submission;
}

/**
 * Returns one page of an assignment's submissions, newest first. Access is
 * checked once, on the assignment.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the viewer's.
 */
export async function listSubmissions(
  ctx: QueryCtx,
  viewer: SubmissionViewer,
  assignmentId: Id<"assignments">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<Doc<"submissions">>> {
  await requireAssignmentAccess(ctx, viewer, assignmentId);
  return await ctx.db
    .query("submissions")
    .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignmentId))
    .order("desc")
    .paginate(paginationOpts);
}

/** `requireSubmission` for a creator, in the creator shape. */
export async function requireCreatorSubmission(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  submissionId: Id<"submissions">,
): Promise<CreatorSubmission> {
  const submission = await requireSubmission(ctx, { role: "creator", creatorId }, submissionId);
  return toCreatorSubmission(submission);
}

/** `listSubmissions` for a creator, in the creator shape. */
export async function listCreatorSubmissions(
  ctx: QueryCtx,
  creatorId: Id<"creators">,
  assignmentId: Id<"assignments">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<CreatorSubmission>> {
  const result = await listSubmissions(
    ctx,
    { role: "creator", creatorId },
    assignmentId,
    paginationOpts,
  );
  return { ...result, page: result.page.map(toCreatorSubmission) };
}
