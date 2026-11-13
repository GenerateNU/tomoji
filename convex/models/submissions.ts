import type { PaginationOptions, PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { optionalNonBlank, requireNonBlank } from "../lib/validation";
import { aiReviewAttemptsTable } from "../schemas/aiReviewAttempts.schema";
import { submissionShapes } from "../schemas/submissions.schema";
import { requireAssignment, requireActiveAssignment, type AssignmentViewer } from "./assignments";
import { creatorName, notifyCompanyUser, notifyCreator } from "./notifications";
import { requireSubmissionVideo } from "./media";
import { criterionResult, type aiReviewResult } from "../lib/ai/validation";
import { decideAiReview, AI_REVIEW_MAX_DURATION_SECONDS } from "../lib/ai/reviewPolicy";
import { env } from "../_generated/server";
import {
  createAiReviewAttempt,
  enqueueAiReview,
  requireCurrentAiReviewAttempt,
  markAiReviewForManualReview,
} from "./aiReviewAttempts";

/** The creator-supplied fields of a new submission. */
export const submissionDraft = v.object({
  assignmentId: v.id("assignments"),
  deliverableId: v.id("deliverables"),
  mediaId: v.id("mediaUploads"),
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
    aiReview: v.optional(
      v.object({
        status: aiReviewAttemptsTable.validator.fields.status,
        results: v.array(criterionResult.pick("criterionId", "outcome")),
      }),
    ),
  }),
);
export type SubmissionView = Infer<typeof submissionView>;

/** Who is reading or acting on submissions. Access follows the assignment's. */
export type SubmissionViewer = AssignmentViewer;

// Limits on free text after trimming. `.length` counts UTF-16 units, so an emoji counts as two.
const MAX_LENGTH = {
  draftDescription: 5000,
} as const;

function requireText(value: string, field: keyof typeof MAX_LENGTH): string {
  return requireNonBlank(value, field, MAX_LENGTH[field]);
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
    deliverableId: submission.deliverableId,
    mediaId: submission.mediaId,
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

/** Requires an active assignment before applying submission-specific deadline rules. */
function requireSubmissionWindowOpen(assignment: Doc<"assignments">): void {
  requireActiveAssignment(assignment);
  // TODO(dueAt): reject after `assignment.dueAt` once assignments have it.
}

/**
 * A deliverable of the assignment's opportunity. Throws `not_found` for one
 * from another opportunity, the same as a missing one.
 */
async function requireAssignmentDeliverable(
  ctx: QueryCtx | MutationCtx,
  assignment: Doc<"assignments">,
  deliverableId: Id<"deliverables">,
): Promise<Doc<"deliverables">> {
  const deliverable = await ctx.db.get("deliverables", deliverableId);
  if (deliverable === null || deliverable.opportunityId !== assignment.opportunityId) {
    throw apiError("not_found", { resource: "deliverable" });
  }
  return deliverable;
}

/**
 * The newest draft for one deliverable of an assignment. Indexes end in
 * `_creationTime`, so descending order reads the newest row first.
 */
export async function getLatestSubmission(
  ctx: QueryCtx | MutationCtx,
  assignmentId: Id<"assignments">,
  deliverableId: Id<"deliverables">,
): Promise<Doc<"submissions"> | null> {
  return await ctx.db
    .query("submissions")
    .withIndex("by_assignmentId_and_deliverableId", (q) =>
      q.eq("assignmentId", assignmentId).eq("deliverableId", deliverableId),
    )
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
  const deliverable = await requireAssignmentDeliverable(ctx, assignment, draft.deliverableId);

  // One approved draft per deliverable; the others are still open to submit.
  const latest = await getLatestSubmission(ctx, assignment._id, deliverable._id);
  if (latest?.status === "pending") {
    throw apiError("conflict", { reason: "submission_pending" });
  }
  if (latest?.status === "approved") {
    throw apiError("invalid_state", { reason: "already_approved" });
  }

  await requireSubmissionVideo(ctx, assignment, draft.mediaId);

  const submissionId = await ctx.db.insert("submissions", {
    assignmentId: assignment._id,
    deliverableId: deliverable._id,
    mediaId: draft.mediaId,
    draftDescription: requireText(draft.draftDescription, "draftDescription"),
    status: "pending",
    usesAiReview: assignment.usesAiReview,
  });
  let automated = false;
  if (assignment.usesAiReview) {
    const attemptId = await createAiReviewAttempt(ctx, submissionId);
    if (env.AI_REVIEW_ENABLED === "true") {
      await enqueueAiReview(ctx, attemptId);
      automated = true;
    }
  }
  const opportunity = await ctx.db.get("opportunities", assignment.opportunityId);
  if (opportunity !== null && !automated) {
    // A draft after a change request is the creator's response to that review.
    const isResubmission = latest?.status === "changesRequested";
    await notifyCompanyUser(ctx, opportunity.createdBy, {
      type: isResubmission ? "submissionResubmitted" : "submissionCreated",
      title: `${await creatorName(ctx, creatorId)} ${isResubmission ? "resubmitted" : "submitted"} a draft for ${opportunity.title}`,
      target: { kind: "submission", submissionId, assignmentId: assignment._id },
    });
  }
  return submissionId;
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
  requireActiveAssignment(assignment);
  const attempt = await ctx.db
    .query("aiReviewAttempts")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
    .order("desc")
    .first();
  if (
    env.AI_REVIEW_ENABLED === "true" &&
    attempt?.workflowId &&
    attempt.status !== "manualReview" &&
    attempt.status !== "completed"
  )
    throw apiError("invalid_state", { reason: "ai_review_processing" });
  return await recordSubmissionReview(ctx, submission, assignment, review, {
    reviewerType: "companyUser",
    reviewedBy: membership._id,
  });
}

/** One submission, as the viewer may see it. */
export async function requireSubmission(
  ctx: QueryCtx,
  viewer: SubmissionViewer,
  submissionId: Id<"submissions">,
): Promise<SubmissionView> {
  const { submission, assignment } = await requireSubmissionAccess(ctx, viewer, submissionId);
  return await withAiReviewSummary(
    ctx,
    toSubmissionView(viewer, submission, isClosedWithoutReview(submission, assignment)),
  );
}

/**
 * One page of the drafts for one deliverable of an assignment, newest first, as
 * the viewer may see them. Drafts are always read per deliverable.
 */
export async function listSubmissions(
  ctx: QueryCtx,
  viewer: SubmissionViewer,
  assignmentId: Id<"assignments">,
  deliverableId: Id<"deliverables">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<SubmissionView>> {
  const assignment = await requireAssignment(ctx, viewer, assignmentId);
  await requireAssignmentDeliverable(ctx, assignment, deliverableId);
  const result = await ctx.db
    .query("submissions")
    .withIndex("by_assignmentId_and_deliverableId", (q) =>
      q.eq("assignmentId", assignmentId).eq("deliverableId", deliverableId),
    )
    .order("desc")
    .paginate(paginationOpts);
  return {
    ...result,
    page: await Promise.all(
      result.page.map((submission) =>
        withAiReviewSummary(
          ctx,
          toSubmissionView(viewer, submission, isClosedWithoutReview(submission, assignment)),
        ),
      ),
    ),
  };
}

/** Projects processing state and criterion outcomes; raw provider evidence stays internal. */
async function withAiReviewSummary(ctx: QueryCtx, view: SubmissionView): Promise<SubmissionView> {
  if (!view.usesAiReview) return view;
  const attempt = await ctx.db
    .query("aiReviewAttempts")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", view._id))
    .order("desc")
    .first();
  if (!attempt) return view;
  return {
    ...view,
    aiReview: {
      status:
        attempt.status !== "completed" && (env.AI_REVIEW_ENABLED !== "true" || !attempt.workflowId)
          ? "manualReview"
          : attempt.status,
      results:
        attempt.result?.results.map(({ criterionId, outcome }) => ({ criterionId, outcome })) ?? [],
    },
  };
}

type Reviewer =
  | { reviewerType: "ai" }
  | { reviewerType: "companyUser"; reviewedBy: Id<"companyUsers"> };

/** Commits either initial reviewer's decision and notification together; callers authorize first. */
export async function recordSubmissionReview<R extends Reviewer>(
  ctx: MutationCtx,
  submission: Extract<Doc<"submissions">, { status: "pending" }>,
  assignment: Doc<"assignments">,
  review: SubmissionReview,
  reviewer: R,
) {
  requireActiveAssignment(assignment);
  const outcome =
    review.status === "changesRequested"
      ? {
          status: review.status,
          reviewNote: requireNonBlank(review.reviewNote, "reviewNote", 2000),
        }
      : {
          status: review.status,
          reviewNote: optionalNonBlank(review.reviewNote, "reviewNote", 2000),
        };
  const patch = { ...outcome, ...reviewer, reviewedAt: Date.now() };
  await ctx.db.patch("submissions", submission._id, patch);
  const opportunity = await ctx.db.get("opportunities", assignment.opportunityId);
  if (opportunity) {
    const target = {
      kind: "submission" as const,
      submissionId: submission._id,
      assignmentId: assignment._id,
    };
    await notifyCreator(
      ctx,
      assignment.creatorId,
      outcome.status === "approved"
        ? {
            type: "submissionApproved",
            title: `Your draft for ${opportunity.title} was approved`,
            target,
          }
        : {
            type: "submissionChangesRequested",
            title: `Changes requested on your draft for ${opportunity.title}`,
            body: outcome.reviewNote,
            target,
          },
    );
  }
  return { ...submission, ...patch };
}

/** Saves evidence and its business outcome in one transaction; retries cannot notify twice. */
export async function finishAiReview(
  ctx: MutationCtx,
  attemptId: Id<"aiReviewAttempts">,
  result: Infer<typeof aiReviewResult>,
): Promise<void> {
  const attempt = await requireCurrentAiReviewAttempt(ctx, attemptId, "evaluating");
  if (
    !attempt.transcription?.text.trim() ||
    attempt.transcription.durationSeconds > AI_REVIEW_MAX_DURATION_SECONDS
  )
    throw apiError("invalid_state", { reason: "review_input_invalid" });
  if (attempt.deadlineAt !== undefined && Date.now() >= attempt.deadlineAt)
    return await markAiReviewForManualReview(ctx, attemptId, "timeout");
  const ids = new Set(result.results.map((item) => item.criterionId));
  if (
    ids.size !== attempt.criteria.length ||
    result.results.length !== ids.size ||
    !attempt.criteria.every((c) => ids.has(c.id))
  )
    throw apiError("invalid_state", { reason: "review_result_mismatch" });
  if (attempt.workflowId && env.AI_REVIEW_ENABLED !== "true")
    return await markAiReviewForManualReview(ctx, attemptId, "disabled");
  const decision = decideAiReview(result.results);
  if (decision.status === "manualReview") {
    // A selected "met"/"not_met" below the cutoff is different from an uncertain answer.
    const reason = result.results.some((item) => item.outcome === "uncertain")
      ? "uncertain"
      : "low_probability";
    await markAiReviewForManualReview(ctx, attemptId, reason);
    await ctx.db.patch("aiReviewAttempts", attemptId, { result });
    return;
  }
  await ctx.db.patch("aiReviewAttempts", attemptId, {
    result,
    status: "completed",
    finishedAt: Date.now(),
  });
  const submission = await ctx.db.get("submissions", attempt.submissionId);
  if (!submission || submission.status !== "pending")
    throw apiError("invalid_state", { reason: "ai_review_stale" });
  const assignment = await ctx.db.get("assignments", submission.assignmentId);
  if (!assignment) throw apiError("not_found", { resource: "assignment" });
  const review =
    decision.status === "approved"
      ? { status: "approved" as const }
      : {
          status: "changesRequested" as const,
          reviewNote: `Please address these spoken requirements: ${attempt.criteria
            .filter((c) => decision.failedCriterionIds.includes(c.id))
            .map((c) => c.description)
            .join("; ")}`.slice(0, 2000),
        };
  await recordSubmissionReview(ctx, submission, assignment, review, { reviewerType: "ai" });
}
