import type { PaginationOptions, PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireBoundedText } from "../lib/validation";
import { submissionShapes } from "../schemas/submissions.schema";
import { requireAssignment, type AssignmentViewer } from "./assignments";

/** The creator-supplied fields of a new submission. */
export const submissionDraft = v.object({
  assignmentId: v.id("assignments"),
  draftUrl: v.string(),
  draftDescription: v.string(),
});
export type SubmissionDraft = Infer<typeof submissionDraft>;

/** A review decision. A change request needs a note; an approval's is optional. */
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
 * What `get` and `list` return. Reviewer IDs are optional because creators never
 * get them (see `toSubmissionView`).
 */
export const submissionView = v.union(
  ...submissionShapes(v.optional(v.id("companyUsers")), v.optional(v.id("users")), {
    _id: v.id("submissions"),
    _creationTime: v.number(),
    // Derived on read, never stored. See `isClosedWithoutReview`.
    closedWithoutReview: v.boolean(),
  }),
);
export type SubmissionView = Infer<typeof submissionView>;

/** Who is reading or acting on submissions. Access follows the assignment's. */
export type SubmissionViewer = AssignmentViewer;

// Limits on free text after trimming. `.length` counts UTF-16 units, so an emoji counts as two.
const MAX_LENGTH = {
  draftUrl: 2048,
  draftDescription: 5000,
  reviewNote: 2000,
} as const;

function requireText(value: string, field: keyof typeof MAX_LENGTH): string {
  return requireBoundedText(value, field, MAX_LENGTH[field]);
}

/** Like `requireText`, but a missing or blank value becomes `undefined`. */
function optionalText(
  value: string | undefined,
  field: keyof typeof MAX_LENGTH,
): string | undefined {
  if (value === undefined || value.trim() === "") return undefined;
  return requireText(value, field);
}

/** Returns the URL in its parsed form, so reviewers open exactly the link that was checked. */
function requireDraftUrl(value: string): string {
  const trimmed = requireText(value, "draftUrl");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw apiError("invalid_state", { reason: "draftUrl_invalid" });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw apiError("invalid_state", { reason: "draftUrl_invalid" });
  }
  // Draft links never need login details, and `drive.google.com@evil.example` goes to evil.example.
  if (url.username !== "" || url.password !== "") {
    throw apiError("invalid_state", { reason: "draftUrl_invalid" });
  }
  // Encoding can make the URL longer than what was typed, so check again.
  if (url.href.length > MAX_LENGTH.draftUrl) {
    throw apiError("invalid_state", { reason: "draftUrl_too_long" });
  }
  return url.href;
}

/**
 * The submission and its assignment, if the viewer may see the assignment.
 * Throws `not_found` whether either is missing or not theirs.
 */
async function requireSubmissionAccess(
  ctx: QueryCtx | MutationCtx,
  viewer: SubmissionViewer,
  submissionId: Id<"submissions">,
): Promise<{ submission: Doc<"submissions">; assignment: Doc<"assignments"> }> {
  const submission = await ctx.db.get("submissions", submissionId);
  if (submission === null) throw apiError("not_found", { resource: "submission" });
  const assignment = await requireAssignment(ctx, viewer, submission.assignmentId);
  return { submission, assignment };
}

/** Still `pending` on an assignment that's no longer active, so it will never be reviewed. */
function isClosedWithoutReview(
  submission: Doc<"submissions">,
  assignment: Doc<"assignments">,
): boolean {
  return submission.status === "pending" && assignment.status !== "active";
}

/** Company users and operators get the stored row; creators get it without reviewer IDs. */
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
 * Copies an explicit list of fields rather than removing reviewer IDs, so a field
 * added to the schema later stays hidden from creators until it's added here.
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

function requireSubmissionWindowOpen(assignment: Doc<"assignments">): void {
  if (assignment.status !== "active") {
    throw apiError("invalid_state", { reason: "assignment_not_active" });
  }
  // TODO(dueAt): reject after `assignment.dueAt` once assignments have it.
}

/** Indexes end in `_creationTime`, so descending order reads the newest row first. */
export async function getLatestSubmission(
  ctx: QueryCtx | MutationCtx,
  assignmentId: Id<"assignments">,
): Promise<Doc<"submissions"> | null> {
  return await ctx.db
    .query("submissions")
    .withIndex("by_assignmentId", (q) => q.eq("assignmentId", assignmentId))
    .order("desc")
    .first();
}

/** Submits a creator's draft for review. Errors are listed on the `submissions.create` route. */
export async function createSubmission(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  draft: SubmissionDraft,
): Promise<Id<"submissions">> {
  const assignment = await requireAssignment(
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

/** Records a company user's review. Errors are listed on the `submissions.review` route. */
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
  if (assignment.status !== "active") {
    throw apiError("invalid_state", { reason: "assignment_not_active" });
  }
  // TODO(ai-layer): reject when `submission.usesAiReview` is true.

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

/** One submission, as the viewer may see it. */
export async function requireSubmission(
  ctx: QueryCtx,
  viewer: SubmissionViewer,
  submissionId: Id<"submissions">,
): Promise<SubmissionView> {
  const { submission, assignment } = await requireSubmissionAccess(ctx, viewer, submissionId);
  return toSubmissionView(viewer, submission, isClosedWithoutReview(submission, assignment));
}

/** One page of an assignment's submissions, newest first, as the viewer may see them. */
export async function listSubmissions(
  ctx: QueryCtx,
  viewer: SubmissionViewer,
  assignmentId: Id<"assignments">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<SubmissionView>> {
  const assignment = await requireAssignment(ctx, viewer, assignmentId);
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
