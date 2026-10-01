import type { PaginationOptions, PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";
import { submissionShapes } from "../schemas/submissions.schema";

// --- Validators and types ---

/** The creator-supplied fields of a new submission */
export const submissionDraft = v.object({
  assignmentId: v.id("assignments"),
  draftUrl: v.string(),
  draftDescription: v.string(),
});
export type SubmissionDraft = Infer<typeof submissionDraft>;

/**
 * A review decision. A note is required when requesting changes; on an
 * approval it is optional, and a blank one is stored as none.
 */
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
 * A submission as `get` and `list` return it, to every caller: the stored row
 * plus `closedWithoutReview`.
 *
 * - Reviewer identity (`reviewedBy`, `reviewedByOperator`, and `reviewedBy`
 *   inside `overriddenReview`) is optional here: company users and operators
 *   always get it, creators never do. `toSubmissionView` decides which.
 * - `closedWithoutReview` is derived on every read, never stored: `true` when a
 *   submission is still `pending` but its assignment is no longer active
 *   (completed or cancelled), so it will never be reviewed. Clients show it as
 *   closed.
 */
export const submissionView = v.union(
  ...submissionShapes(v.optional(v.id("companyUsers")), v.optional(v.id("users")), {
    _id: v.id("submissions"),
    _creationTime: v.number(),
    closedWithoutReview: v.boolean(),
  }),
);
export type SubmissionView = Infer<typeof submissionView>;

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
 * Validates a free-text field: trims it, rejects blank input, and enforces the
 * field's limit from `MAX_LENGTH`, measured after trimming. Every text field goes
 * through here, so each one is guaranteed a limit.
 *
 * @returns the trimmed value, which is what gets stored.
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
 * Like `requireText`, but for an optional field: returns `undefined` when the
 * value is missing or blank instead of throwing.
 *
 * @throws `invalid_state` with reason `<field>_too_long`.
 */
function optionalText(
  value: string | undefined,
  field: keyof typeof MAX_LENGTH,
): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return requireText(value, field);
}

/**
 * Returns the draft URL in its parsed form: percent-encoded, with no stray
 * whitespace and a lowercase scheme and host. That form is what gets stored,
 * so reviewers open exactly the link that was validated.
 *
 * @throws `invalid_state` with reason `draftUrl_blank`, `draftUrl_too_long`, or
 * `draftUrl_invalid` (not http(s), or it includes login details).
 */
function requireDraftUrl(value: string): string {
  // Checks the raw text's length first, so oversized input is never parsed.
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
  // `https://drive.google.com@evil.example` goes to evil.example. Draft links
  // never need login details, so reject them rather than silently strip them.
  if (url.username !== "" || url.password !== "") {
    throw apiError("invalid_state", { reason: "draftUrl_invalid" });
  }
  // Encoding can make the URL longer than what was typed, so check again.
  if (url.href.length > MAX_LENGTH.draftUrl) {
    throw apiError("invalid_state", { reason: "draftUrl_too_long" });
  }
  return url.href;
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

// --- Read shapes ---

/**
 * Whether a submission will never be reviewed: it's still `pending`, but its
 * assignment was completed or cancelled. A reviewed submission is never closed
 * without review, whatever happened to its assignment later.
 */
function isClosedWithoutReview(
  submission: Doc<"submissions">,
  assignment: Doc<"assignments">,
): boolean {
  return submission.status === "pending" && assignment.status !== "active";
}

/**
 * Returns a submission as the viewer may see it. Company users and operators get
 * the stored row; creators get it without reviewer identity. Both get
 * `closedWithoutReview`.
 */
export function toSubmissionView(
  viewer: SubmissionViewer,
  submission: Doc<"submissions">,
  closedWithoutReview: boolean,
): SubmissionView {
  switch (viewer.role) {
    case "company":
    case "operator":
      return { ...submission, closedWithoutReview };
    case "creator":
      return toCreatorView(submission, closedWithoutReview);
  }
}

/** A review's status and note, kept paired so a change request keeps its note. */
function reviewOutcome(
  review:
    | { status: "approved"; reviewNote?: string }
    | { status: "changesRequested"; reviewNote: string },
) {
  return review.status === "changesRequested"
    ? { status: review.status, reviewNote: review.reviewNote }
    : { status: review.status, reviewNote: review.reviewNote };
}

/**
 * A submission without who reviewed it, at either level. It copies an explicit
 * list of fields rather than removing the hidden ones, so a field added to the
 * schema later stays hidden from creators until someone adds it here on purpose.
 */
function toCreatorView(
  submission: Doc<"submissions">,
  closedWithoutReview: boolean,
): SubmissionView {
  const draft = {
    _id: submission._id,
    _creationTime: submission._creationTime,
    assignmentId: submission.assignmentId,
    draftUrl: submission.draftUrl,
    draftDescription: submission.draftDescription,
    usesAiReview: submission.usesAiReview,
    closedWithoutReview,
  };
  if (submission.status === "pending") return { ...draft, status: "pending" };

  const review = { ...draft, ...reviewOutcome(submission), reviewedAt: submission.reviewedAt };
  switch (submission.reviewerType) {
    case "ai":
      return { ...review, reviewerType: "ai" };
    case "companyUser":
      return { ...review, reviewerType: "companyUser" };
    case "operator": {
      const replaced = submission.overriddenReview;
      return {
        ...review,
        reviewerType: "operator",
        overriddenReview: {
          ...reviewOutcome(replaced),
          reviewerType: replaced.reviewerType,
          reviewedAt: replaced.reviewedAt,
        },
        disputeId: submission.disputeId,
      };
    }
  }
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
 * Submits a creator's draft for review on their own active assignment. The URL
 * is stored in its parsed form.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the creator's.
 * @throws `invalid_state` if the assignment isn't active, a draft is already
 * approved, a draft field is blank or too long, or the URL isn't http(s) or
 * includes login details.
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
 * Reviews are final: only a `pending` submission can be reviewed. A blank note
 * on an approval is stored as no note.
 *
 * @throws `not_found` if the submission doesn't exist or isn't the company's.
 * @throws `invalid_state` if it was already reviewed, the assignment isn't
 * active, the note on a change request is blank, or the note is too long.
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
  // Reads report such a draft as `closedWithoutReview`, so it isn't left looking
  // like it's still awaiting review.
  if (assignment.status !== "active") {
    throw apiError("invalid_state", { reason: "assignment_not_active" });
  }
  // TODO(ai-layer): reject when `submission.usesAiReview` is true. Until the AI
  // layer exists, company users review every submission.

  // A change request must tell the creator what to fix, so its note can't be
  // blank. An approval's note is optional, so a blank one is stored as none.
  // Built per branch so the type keeps each status paired with its note rule.
  const outcome =
    review.status === "changesRequested"
      ? { status: review.status, reviewNote: requireText(review.reviewNote, "reviewNote") }
      : { status: review.status, reviewNote: optionalText(review.reviewNote, "reviewNote") };
  const patch = {
    ...outcome,
    reviewerType: "companyUser" as const,
    reviewedBy: membership._id,
    reviewedAt: Date.now(),
  };
  await ctx.db.patch("submissions", submissionId, patch);
  return { ...submission, ...patch };
}

// --- Reads ---
// One pair for every caller: `toSubmissionView` decides what the viewer sees.

/**
 * Returns one submission as the viewer may see it (see `toSubmissionView`).
 *
 * @throws `not_found` if the submission doesn't exist or isn't the viewer's.
 */
export async function requireSubmission(
  ctx: QueryCtx,
  viewer: SubmissionViewer,
  submissionId: Id<"submissions">,
): Promise<SubmissionView> {
  const { submission, assignment } = await requireSubmissionAccess(ctx, viewer, submissionId);
  return toSubmissionView(viewer, submission, isClosedWithoutReview(submission, assignment));
}

/**
 * Returns one page of an assignment's submissions, newest first, as the viewer
 * may see them. Access is checked once, on the assignment, which also gives
 * every row its `closedWithoutReview` flag.
 *
 * @throws `not_found` if the assignment doesn't exist or isn't the viewer's.
 */
export async function listSubmissions(
  ctx: QueryCtx,
  viewer: SubmissionViewer,
  assignmentId: Id<"assignments">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<SubmissionView>> {
  const assignment = await requireAssignmentAccess(ctx, viewer, assignmentId);
  const result = await ctx.db
    .query("submissions")
    .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignmentId))
    .order("desc")
    .paginate(paginationOpts);
  return {
    ...result,
    page: result.page.map((submission) =>
      toSubmissionView(viewer, submission, isClosedWithoutReview(submission, assignment)),
    ),
  };
}
