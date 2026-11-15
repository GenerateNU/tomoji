import { v } from "convex/values";
import { internal } from "./_generated/api";
import { aiReviewWorkflow } from "./lib/ai/workflow";
import {
  AI_REVIEW_MAX_DURATION_SECONDS,
  AI_REVIEW_MAX_POLLS,
  AI_REVIEW_MAX_RETRIES,
  AI_REVIEW_POLL_INTERVAL_MS,
} from "./lib/ai/reviewPolicy";

/** Runs durable provider steps, preserving the transcript across bounded evaluation retries. */
export const run = aiReviewWorkflow
  .define({
    args: { attemptId: v.id("aiReviewAttempts") },
    returns: v.null(),
  })
  .handler(async (step, args): Promise<null> => {
    const attempt = await step.runMutation(internal.aiReviewInternal.claim, args);
    if (attempt.mediaId) {
      // An external POST is never automatically retried, including after a process interruption.
      const submitted = await step.runAction(internal.aiReviewActions.submit, args, {
        retry: false,
      });
      if (!submitted.ok) {
        await step.runMutation(internal.aiReviewInternal.fallback, {
          ...args,
          reason: submitted.reason,
        });
        return null;
      }
      let pollFailures = 0;
      let transcriptReady = false;
      for (let i = 0; i < AI_REVIEW_MAX_POLLS; i++) {
        const response = await step.runAction(internal.aiReviewActions.poll, args, {
          retry: false,
          runAfter: AI_REVIEW_POLL_INTERVAL_MS,
        });
        if (!response.ok) {
          pollFailures++;
          if (!response.retryable || pollFailures >= AI_REVIEW_MAX_RETRIES) {
            await step.runMutation(internal.aiReviewInternal.fallback, {
              ...args,
              reason: response.reason,
            });
            return null;
          }
          await step.sleep(Math.max(response.retryAfterMs, 1000 * 2 ** pollFailures));
          continue;
        }
        const transcript = response.transcription;
        if (transcript.status === "queued" || transcript.status === "processing") continue;
        if (transcript.status === "error") {
          await step.runMutation(internal.aiReviewInternal.fallback, {
            ...args,
            reason: "transcription_failed",
          });
          return null;
        }
        if (
          transcript.durationSeconds > AI_REVIEW_MAX_DURATION_SECONDS ||
          (!transcript.text.trim() && !attempt.caption)
        ) {
          await step.runMutation(internal.aiReviewInternal.fallback, {
            ...args,
            reason:
              transcript.durationSeconds > AI_REVIEW_MAX_DURATION_SECONDS
                ? "duration_exceeded"
                : "no_speech",
          });
          return null;
        }
        await step.runMutation(internal.aiReviewInternal.saveTranscript, {
          ...args,
          transcription: transcript,
        });
        transcriptReady = true;
        break;
      }
      if (!transcriptReady) {
        await step.runMutation(internal.aiReviewInternal.fallback, { ...args, reason: "timeout" });
        return null;
      }
    }
    for (let i = 0; i < AI_REVIEW_MAX_RETRIES; i++) {
      const response = await step.runAction(internal.aiReviewActions.evaluate, args, {
        retry: false,
      });
      if (response.ok) {
        await step.runMutation(internal.aiReviewInternal.finish, {
          ...args,
          result: response.result,
        });
        return null;
      }
      if (!response.retryable || i === AI_REVIEW_MAX_RETRIES - 1) {
        await step.runMutation(internal.aiReviewInternal.fallback, {
          ...args,
          reason: response.reason,
        });
        return null;
      }
      await step.sleep(Math.max(response.retryAfterMs, 1000 * 2 ** (i + 1)));
    }
    return null;
  });
