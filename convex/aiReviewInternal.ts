import { vWorkflowId, vResultValidator } from "@convex-dev/workflow";
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { aiReviewFailureReason } from "./schemas/aiReviewAttempts.schema";
import schema from "./schema";
import { aiReviewResult, completedTranscription } from "./lib/ai/validation";
import {
  expireAiReview,
  completeAiReviewWorkflow,
  claimAiReviewAttempt,
  recordAiTranscriptionJob,
  saveAiTranscription,
  getAiReviewInput,
  finishAiReview,
  markAiReviewForManualReview,
  reserveAiTranscription,
  getAiReviewVideo,
} from "./models/aiReviewAttempts";

const attemptArgs = { attemptId: v.id("aiReviewAttempts") };

/** Claims a prepared attempt before provider work starts. */
export const claim = internalMutation({
  args: attemptArgs,
  returns: schema.doc("aiReviewAttempts"),
  handler: async (ctx, { attemptId }) => await claimAiReviewAttempt(ctx, attemptId),
});
/** Reads only eligible, current worker input; no client can request arbitrary provider URLs. */
export const input = internalQuery({
  args: attemptArgs,
  returns: schema.doc("aiReviewAttempts"),
  handler: async (ctx, { attemptId }) => await getAiReviewInput(ctx, attemptId),
});
/** Authorizes and reserves the sole billed transcription dispatch. */
export const reserve = internalMutation({
  args: attemptArgs,
  returns: v.boolean(),
  handler: async (ctx, { attemptId }) => await reserveAiTranscription(ctx, attemptId),
});
/** Retains the job before any polling step. */
export const recordJob = internalMutation({
  args: { ...attemptArgs, jobId: v.string() },
  returns: v.null(),
  handler: async (ctx, { attemptId, jobId }) => {
    await recordAiTranscriptionJob(ctx, attemptId, jobId);
  },
});
/** Retains transcript evidence before evaluation. */
export const saveTranscript = internalMutation({
  args: { ...attemptArgs, transcription: completedTranscription },
  returns: v.null(),
  handler: async (ctx, { attemptId, transcription }) => {
    await saveAiTranscription(ctx, attemptId, transcription);
  },
});
/** Applies a validated AI result and any business decision atomically. */
export const finish = internalMutation({
  args: { ...attemptArgs, result: aiReviewResult },
  returns: v.null(),
  handler: async (ctx, { attemptId, result }) => {
    await finishAiReview(ctx, attemptId, result);
  },
});
/** Leaves a pending draft available to its company. */
export const fallback = internalMutation({
  args: { ...attemptArgs, reason: aiReviewFailureReason },
  returns: v.null(),
  handler: async (ctx, { attemptId, reason }) => {
    await markAiReviewForManualReview(ctx, attemptId, reason);
  },
});
/** Bounds wall-clock processing independently of workflow progress. */
export const expire = internalMutation({
  args: attemptArgs,
  returns: v.null(),
  handler: async (ctx, { attemptId }) => {
    await expireAiReview(ctx, attemptId);
  },
});
/** Handles crashes and cancellation without logging provider payloads or touching a final review. */
export const onComplete = internalMutation({
  args: { workflowId: vWorkflowId, result: vResultValidator, context: v.object(attemptArgs) },
  returns: v.null(),
  handler: async (ctx, { workflowId, context }) => {
    await completeAiReviewWorkflow(ctx, context.attemptId, workflowId);
  },
});

/** Resolves a worker's S3 key after lifecycle and media ownership checks. */
export const video = internalQuery({
  args: attemptArgs,
  returns: v.object({ key: v.string() }),
  handler: async (ctx, { attemptId }) => await getAiReviewVideo(ctx, attemptId),
});
