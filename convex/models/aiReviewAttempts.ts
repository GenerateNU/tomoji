import { internal } from "../_generated/api";
import { aiReviewWorkflow } from "../lib/ai/workflow";
import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { normalizeReviewCriteria, type completedTranscription } from "../lib/ai/validation";
import { AI_REVIEW_TIMEOUT_MS } from "../lib/ai/reviewPolicy";
import { notifyCompanyUser } from "./notifications";
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
  if (submission.mediaId) await requireSubmissionVideo(ctx, assignment, submission.mediaId);
  else if (!submission.caption)
    throw apiError("invalid_state", { reason: "submission_evidence_required" });
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
  const { title, description, contentRequirements, reviewPolicy } = opportunity;
  return await ctx.db.insert("aiReviewAttempts", {
    submissionId,
    mediaId: submission.mediaId,
    caption: submission.caption,
    criteria,
    context: { title, description, contentRequirements, reviewPolicy },
    // The creator submission transaction enqueues work when automation is enabled.
    status: "ready",
  });
}

/** Every write rechecks ownership-independent lifecycle guards in the same transaction. */
export async function requireCurrentAiReviewAttempt(
  ctx: MutationCtx | QueryCtx,
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
    submission.caption !== attempt.caption ||
    assignment?.status !== "active"
  )
    throw apiError("invalid_state", { reason: "ai_review_stale" });
  if (attempt.mediaId) await requireSubmissionVideo(ctx, assignment, attempt.mediaId);
  return attempt;
}

/** Claims a prepared attempt exactly once before any provider submission. */
export async function claimAiReviewAttempt(
  ctx: MutationCtx,
  attemptId: Id<"aiReviewAttempts">,
): Promise<Doc<"aiReviewAttempts">> {
  const attempt = await requireCurrentAiReviewAttempt(ctx, attemptId, "ready");
  const status = attempt.mediaId ? "transcribing" : "evaluating";
  const patch = { status, startedAt: Date.now() } as const;
  await ctx.db.patch("aiReviewAttempts", attemptId, patch);
  return { ...attempt, ...patch };
}

/** Persists the provider job ID without letting later responses replace it. */
export async function recordAiTranscriptionJob(
  ctx: MutationCtx,
  attemptId: Id<"aiReviewAttempts">,
  jobId: string,
): Promise<void> {
  const attempt = await requireCurrentAiReviewAttempt(ctx, attemptId, "transcribing");
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
  const attempt = await requireCurrentAiReviewAttempt(ctx, attemptId, "transcribing");
  if (transcription.id !== attempt.transcriptionJobId)
    throw apiError("invalid_state", { reason: "transcription_job_mismatch" });
  await ctx.db.patch("aiReviewAttempts", attemptId, { transcription, status: "evaluating" });
}

/** Reserves one external POST; a crash after dispatch is ambiguous, never a reason to bill twice. */
export async function reserveAiTranscription(
  ctx: MutationCtx,
  attemptId: Id<"aiReviewAttempts">,
): Promise<boolean> {
  const attempt = await requireCurrentAiReviewAttempt(ctx, attemptId, "transcribing");
  if (attempt.deadlineAt !== undefined && Date.now() >= attempt.deadlineAt)
    throw apiError("invalid_state", { reason: "ai_review_timeout" });
  if (attempt.dispatchStartedAt !== undefined) return false;
  await ctx.db.patch("aiReviewAttempts", attemptId, { dispatchStartedAt: Date.now() });
  return true;
}

/** Returns the current attempt for a worker without exposing operational data publicly. */
export async function getAiReviewInput(
  ctx: QueryCtx,
  attemptId: Id<"aiReviewAttempts">,
): Promise<Doc<"aiReviewAttempts">> {
  const attempt = await ctx.db.get("aiReviewAttempts", attemptId);
  if (!attempt || (attempt.status !== "transcribing" && attempt.status !== "evaluating"))
    throw apiError("invalid_state", { reason: "ai_review_stale" });
  await requireCurrentAiReviewAttempt(ctx, attemptId, attempt.status);
  return attempt;
}

/** A terminal fallback is safe to repeat, including after cancellation or a worker crash. */
export async function markAiReviewForManualReview(
  ctx: MutationCtx,
  attemptId: Id<"aiReviewAttempts">,
  reason: NonNullable<Doc<"aiReviewAttempts">["failureReason"]>,
): Promise<void> {
  const attempt = await ctx.db.get("aiReviewAttempts", attemptId);
  if (!attempt || attempt.status === "completed" || attempt.status === "manualReview") return;
  await ctx.db.patch("aiReviewAttempts", attemptId, {
    status: "manualReview",
    failureReason: reason,
    finishedAt: Date.now(),
  });
  const submission = await ctx.db.get("submissions", attempt.submissionId);
  const assignment = submission && (await ctx.db.get("assignments", submission.assignmentId));
  const latest = await ctx.db
    .query("aiReviewAttempts")
    .withIndex("by_submissionId", (q) => q.eq("submissionId", attempt.submissionId))
    .order("desc")
    .first();
  if (
    submission?.status !== "pending" ||
    assignment?.status !== "active" ||
    latest?._id !== attemptId
  )
    return;
  const opportunity = await ctx.db.get("opportunities", assignment.opportunityId);
  if (opportunity)
    await notifyCompanyUser(ctx, opportunity.createdBy, {
      type: "submissionCreated",
      title: `A draft for ${opportunity.title} needs your review`,
      target: { kind: "submission", submissionId: submission._id, assignmentId: assignment._id },
    });
}

/** Resolves only the immutable object already authorized by the attempt's ownership guards. */
export async function getAiReviewVideo(
  ctx: QueryCtx,
  attemptId: Id<"aiReviewAttempts">,
): Promise<{ key: string }> {
  const attempt = await getAiReviewInput(ctx, attemptId);
  if (!attempt.mediaId) throw apiError("invalid_state", { reason: "invalid_media_object" });
  const media = await ctx.db.get("mediaUploads", attempt.mediaId);
  if (!media?.permanentKey) throw apiError("invalid_state", { reason: "invalid_media_object" });
  return { key: media.permanentKey };
}

/** Releases a timed-out worker even if its workflow no longer makes progress. */
export async function expireAiReview(
  ctx: MutationCtx,
  attemptId: Id<"aiReviewAttempts">,
): Promise<void> {
  const attempt = await ctx.db.get("aiReviewAttempts", attemptId);
  if (attempt?.deadlineAt !== undefined && Date.now() >= attempt.deadlineAt)
    await markAiReviewForManualReview(ctx, attemptId, "timeout");
}

/** A workflow completion callback may only close its own nonterminal attempt. */
export async function completeAiReviewWorkflow(
  ctx: MutationCtx,
  attemptId: Id<"aiReviewAttempts">,
  workflowId: string,
): Promise<void> {
  const attempt = await ctx.db.get("aiReviewAttempts", attemptId);
  if (attempt?.workflowId === workflowId)
    await markAiReviewForManualReview(ctx, attemptId, "review_failed");
}

/** Enqueues exactly one workflow in the same transaction as the submission and attempt. */
export async function enqueueAiReview(
  ctx: MutationCtx,
  attemptId: Id<"aiReviewAttempts">,
): Promise<void> {
  const attempt = await ctx.db.get("aiReviewAttempts", attemptId);
  if (!attempt || attempt.workflowId || attempt.status !== "ready") return;
  const deadlineAt = Date.now() + AI_REVIEW_TIMEOUT_MS;
  const workflowId = await aiReviewWorkflow.start(
    ctx,
    internal.aiReview.run,
    { attemptId },
    {
      startAsync: true,
      onComplete: internal.aiReviewInternal.onComplete,
      context: { attemptId },
    },
  );
  await ctx.db.patch("aiReviewAttempts", attemptId, { workflowId, deadlineAt });
  // Also releases a draft if execution stops before the completion callback can run.
  await ctx.scheduler.runAt(deadlineAt, internal.aiReviewInternal.expire, { attemptId });
}
