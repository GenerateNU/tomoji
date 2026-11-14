"use node";

import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v, type Infer } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { internalAction, env } from "./_generated/server";
import { submitTranscription, getTranscription, type Transcription } from "./lib/ai/assemblyAi";
import { evaluateTranscript } from "./lib/ai/jev";
import { readAiReviewConfig } from "./lib/ai/aiProvider";
import { providerStepFailure, providerFailure } from "./lib/ai/providerStep";
import { aiReviewResult, completedTranscription } from "./lib/ai/validation";
import { createMediaS3Client, readMediaConfig } from "./lib/s3";
import { apiError } from "./lib/errors";

const args = { attemptId: v.id("aiReviewAttempts") };
const submitResult = v.union(
  v.object({ ok: v.literal(true), jobId: v.string() }),
  providerStepFailure,
);
const pollResult = v.union(
  v.object({
    ok: v.literal(true),
    transcription: v.union(
      completedTranscription,
      v.object({ id: v.string(), status: v.literal("queued") }),
      v.object({ id: v.string(), status: v.literal("processing") }),
      v.object({ id: v.string(), status: v.literal("error") }),
    ),
  }),
  providerStepFailure,
);
const evaluateResult = v.union(
  v.object({ ok: v.literal(true), result: aiReviewResult }),
  providerStepFailure,
);
const disabled = { ok: false, reason: "disabled", retryable: false, retryAfterMs: 0 } as const;
const providerVideoUrlTtlSeconds = 60 * 60;

/** Time-dependent checks live in actions, not cached queries. */
async function requireWorkerInput(
  ctx: ActionCtx,
  input: { attemptId: Id<"aiReviewAttempts"> },
): Promise<Doc<"aiReviewAttempts">> {
  const attempt = await ctx.runQuery(internal.aiReviewInternal.input, input);
  if (attempt.deadlineAt !== undefined && Date.now() >= attempt.deadlineAt)
    throw apiError("invalid_state", { reason: "ai_review_timeout" });
  return attempt;
}

/** Submits one fresh, authorized private video; a prior dispatch is never submitted again. */
export const submit = internalAction({
  args,
  returns: submitResult,
  handler: async (ctx, input): Promise<Infer<typeof submitResult>> => {
    if (env.AI_REVIEW_ENABLED !== "true") return disabled;
    try {
      const config = readAiReviewConfig(env);
      const attempt = await requireWorkerInput(ctx, input);
      if (attempt.transcriptionJobId) return { ok: true, jobId: attempt.transcriptionJobId };
      const media = await ctx.runQuery(internal.aiReviewInternal.video, input);
      const s3 = readMediaConfig(env);
      const url = await getSignedUrl(
        createMediaS3Client(s3),
        new GetObjectCommand({ Bucket: s3.bucket, Key: media.key }),
        { expiresIn: providerVideoUrlTtlSeconds },
      );
      if (!(await ctx.runMutation(internal.aiReviewInternal.reserve, input)))
        return { ok: false, reason: "ambiguous_submission", retryable: false, retryAfterMs: 0 };
      const jobId = await submitTranscription(config.assemblyAiKey, url);
      await ctx.runMutation(internal.aiReviewInternal.recordJob, { ...input, jobId });
      return { ok: true, jobId };
    } catch (error) {
      return providerFailure(error, "transcription_failed");
    }
  },
});

/** Polls an existing job once; durable workflow steps own waiting and retry bounds. */
export const poll = internalAction({
  args,
  returns: pollResult,
  handler: async (ctx, input): Promise<Infer<typeof pollResult>> => {
    if (env.AI_REVIEW_ENABLED !== "true") return disabled;
    try {
      const attempt = await requireWorkerInput(ctx, input);
      if (!attempt.transcriptionJobId)
        throw apiError("invalid_state", { reason: "transcription_job_missing" });
      const transcription: Transcription = await getTranscription(
        readAiReviewConfig(env).assemblyAiKey,
        attempt.transcriptionJobId,
      );
      return { ok: true, transcription };
    } catch (error) {
      return providerFailure(error, "transcription_failed");
    }
  },
});

/** Evaluates persisted evidence against the exact criteria and brief snapshot. */
export const evaluate = internalAction({
  args,
  returns: evaluateResult,
  handler: async (ctx, input): Promise<Infer<typeof evaluateResult>> => {
    if (env.AI_REVIEW_ENABLED !== "true") return disabled;
    try {
      const attempt = await requireWorkerInput(ctx, input);
      if (attempt.mediaId && !attempt.transcription)
        throw apiError("invalid_state", { reason: "transcription_missing" });
      const result = await evaluateTranscript(
        readAiReviewConfig(env).jevKey,
        attempt.transcription?.text ?? "",
        attempt.criteria,
        attempt.context,
        attempt.caption,
      );
      return { ok: true, result };
    } catch (error) {
      return providerFailure(error, "review_failed");
    }
  },
});
