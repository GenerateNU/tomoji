import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import {
  normalizeReviewCriteria,
  type aiReviewResult,
  type completedTranscription,
} from "../lib/ai/validation";
import { requireActiveAssignment } from "./assignments";
import { requireSubmissionVideo } from "./media";

/** Snapshots one media-backed submission atomically; repeated preparation returns its existing attempt. */
export async function createAiReviewAttempt(
  ctx: MutationCtx,
  submissionId: Id<"submissions">,
): Promise<Id<"aiReviewAttempts">> {
  const submission = await ctx.db.get("submissions", submissionId);
  if (!submission || submission.status !== "pending" || !submission.usesAiReview)
    throw apiError("invalid_state", { reason: "ai_review_not_eligible" });
  const assignment = await ctx.db.get("assignments", submission.assignmentId);
  if (!assignment) throw apiError("not_found", { resource: "assignment" });
  requireActiveAssignment(assignment);
  await requireSubmissionVideo(ctx, assignment, submission.mediaId);
  const existing = await ctx.db
    .query("aiReviewAttempts")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
    .order("desc")
    .first();
  if (existing) return existing._id;
  const deliverable = await ctx.db.get("deliverables", submission.deliverableId);
  const opportunity = await ctx.db.get("opportunities", assignment.opportunityId);
  if (!deliverable || !opportunity || deliverable.opportunityId !== opportunity._id)
    throw apiError("not_found", { resource: "deliverable" });
  const criteria = normalizeReviewCriteria(deliverable.reviewCriteria ?? []);
  if (criteria.length === 0)
    throw apiError("invalid_state", { reason: "ai_review_criteria_required" });
  const { title, description, contentRequirements, prohibitedClaims, disclosureRequirements } =
    opportunity;
  return await ctx.db.insert("aiReviewAttempts", {
    submissionId,
    mediaId: submission.mediaId,
    criteria,
    context: { title, description, contentRequirements, prohibitedClaims, disclosureRequirements },
    // Prepared only. PR 3 will schedule provider work; nothing is enqueued here.
    status: "ready",
  });
}

/** Every write rechecks ownership-independent lifecycle guards in the same transaction. */
async function requireCurrentAttempt(
  ctx: MutationCtx,
  attemptId: Id<"aiReviewAttempts">,
  status: Doc<"aiReviewAttempts">["status"],
): Promise<Doc<"aiReviewAttempts">> {
  const attempt = await ctx.db.get("aiReviewAttempts", attemptId);
  if (!attempt) throw apiError("not_found", { resource: "aiReviewAttempt" });
  const submission = await ctx.db.get("submissions", attempt.submissionId);
  const assignment = submission && (await ctx.db.get("assignments", submission.assignmentId));
  const latest = await ctx.db
    .query("aiReviewAttempts")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", attempt.submissionId))
    .order("desc")
    .first();
  if (
    attempt.status !== status ||
    latest?._id !== attemptId ||
    submission?.status !== "pending" ||
    !submission.usesAiReview ||
    submission.mediaId !== attempt.mediaId ||
    assignment?.status !== "active"
  )
    throw apiError("invalid_state", { reason: "ai_review_stale" });
  await requireSubmissionVideo(ctx, assignment, attempt.mediaId);
  return attempt;
}

/** Claims a prepared attempt exactly once before any provider submission. */
export async function claimAiReviewAttempt(
  ctx: MutationCtx,
  attemptId: Id<"aiReviewAttempts">,
): Promise<Doc<"aiReviewAttempts">> {
  const attempt = await requireCurrentAttempt(ctx, attemptId, "ready");
  const patch = { status: "transcribing" as const, startedAt: Date.now() };
  await ctx.db.patch("aiReviewAttempts", attemptId, patch);
  return { ...attempt, ...patch };
}

/** Persists the provider job ID without letting later responses replace it. */
export async function recordAiTranscriptionJob(
  ctx: MutationCtx,
  attemptId: Id<"aiReviewAttempts">,
  jobId: string,
): Promise<void> {
  const attempt = await requireCurrentAttempt(ctx, attemptId, "transcribing");
  if (
    !jobId.trim() ||
    (attempt.transcriptionJobId !== undefined && attempt.transcriptionJobId !== jobId)
  )
    throw apiError("invalid_state", { reason: "transcription_job_mismatch" });
  await ctx.db.patch("aiReviewAttempts", attemptId, { transcriptionJobId: jobId });
}

/** Retains a completed transcript so evaluation retries need not transcribe the video again. */
export async function saveAiTranscription(
  ctx: MutationCtx,
  attemptId: Id<"aiReviewAttempts">,
  transcription: Infer<typeof completedTranscription>,
): Promise<void> {
  const attempt = await requireCurrentAttempt(ctx, attemptId, "transcribing");
  if (transcription.id !== attempt.transcriptionJobId)
    throw apiError("invalid_state", { reason: "transcription_job_mismatch" });
  await ctx.db.patch("aiReviewAttempts", attemptId, { transcription, status: "evaluating" });
}

/** Stores every snapshotted criterion's result; business approval remains PR 3's responsibility. */
export async function saveAiReviewResult(
  ctx: MutationCtx,
  attemptId: Id<"aiReviewAttempts">,
  result: Infer<typeof aiReviewResult>,
): Promise<void> {
  const attempt = await requireCurrentAttempt(ctx, attemptId, "evaluating");
  const ids = new Set(result.results.map((item) => item.criterionId));
  if (
    ids.size !== attempt.criteria.length ||
    result.results.length !== ids.size ||
    !attempt.criteria.every((criterion) => ids.has(criterion.id))
  )
    throw apiError("invalid_state", { reason: "review_result_mismatch" });
  await ctx.db.patch("aiReviewAttempts", attemptId, {
    result,
    status: "completed",
    finishedAt: Date.now(),
  });
}

/** Preserves an eligible pending submission for human review without interpreting failure as rejection. */
export async function markAiReviewForManualReview(
  ctx: MutationCtx,
  attemptId: Id<"aiReviewAttempts">,
  reason: NonNullable<Doc<"aiReviewAttempts">["failureReason"]>,
): Promise<void> {
  const attempt = await ctx.db.get("aiReviewAttempts", attemptId);
  if (!attempt || attempt.status === "completed" || attempt.status === "manualReview")
    throw apiError("invalid_state", { reason: "ai_review_stale" });
  await requireCurrentAttempt(ctx, attemptId, attempt.status);
  await ctx.db.patch("aiReviewAttempts", attemptId, {
    status: "manualReview",
    failureReason: reason,
    finishedAt: Date.now(),
  });
}
