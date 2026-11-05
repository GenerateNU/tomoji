/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { Infer } from "convex/values";
import { afterEach, expect, test, vi } from "vitest";
import schema from "../../schema";
import type { aiReviewResult } from "../../lib/ai/validation";
import { createSubmission, reviewSubmission } from "../../models/submissions";
import {
  claimAiReviewAttempt,
  createAiReviewAttempt,
  markAiReviewForManualReview,
  recordAiTranscriptionJob,
  saveAiTranscription,
  saveAiReviewResult,
} from "../../models/aiReviewAttempts";
import {
  seedAssignmentFixture,
  submissionArgs,
  seedAiReviewFixture,
  seedSubmissionVideo,
  expectApiError,
  aiTranscriptionArgs,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
const reviewResult: Infer<typeof aiReviewResult> = {
  model: "jev-1.14.0",
  inputTokens: 200,
  outputTokens: 10,
  results: [
    {
      criterionId: "product",
      outcome: "met",
      confidence: 0.9,
      probabilities: { met: 0.95, not_met: 0.03, uncertain: 0.02 },
    },
  ],
};
const reviewCriteria = [
  { id: "product", description: "Mention Driftwood." },
  { id: "disclosure", description: "Disclose the paid partnership." },
];
afterEach(() => vi.useRealTimers());

test("prepares an owned video with an independent criteria and brief snapshot", async () => {
  const t = convexTest(schema, modules);
  const { mediaId, submissionId, attempt } = await seedAiReviewFixture(t);
  expect(attempt).toMatchObject({
    submissionId,
    mediaId,
    status: "ready",
    criteria: [{ id: "product", description: "Mention Driftwood." }],
    context: {
      title: "Driftwood launch demo",
      description: "Demonstrate a first deployment using Driftwood CLI.",
      contentRequirements: "Explain how Driftwood simplifies deployment.",
      prohibitedClaims: "Do not promise zero downtime.",
      disclosureRequirements: "Disclose the paid partnership.",
    },
  });
});

test("preparing the same submission twice returns one attempt", async () => {
  const t = convexTest(schema, modules);
  const { submissionId, attempt } = await seedAiReviewFixture(t);
  expect(await t.run((ctx) => createAiReviewAttempt(ctx, submissionId))).toBe(attempt._id);
  const attempts = await t.run((ctx) =>
    ctx.db
      .query("aiReviewAttempts")
      .withIndex("by_submissionId", (q) => q.eq("submissionId", submissionId))
      .take(2),
  );
  expect(attempts).toHaveLength(1);
});

test("snapshot survives later brief changes", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);
  await t.run(async (ctx) => {
    const deliverable = await ctx.db.get("deliverables", fixture.deliverableId);
    if (!deliverable) throw new Error("expected seeded deliverable");
    // Simulate upstream edits directly: normal deliverable updates are locked after assignment.
    await ctx.db.patch("deliverables", fixture.deliverableId, { reviewCriteria: [] });
    await ctx.db.patch("opportunities", deliverable.opportunityId, { title: "Changed brief" });
  });
  const stored = await t.run((ctx) => ctx.db.get("aiReviewAttempts", fixture.attempt._id));
  expect(stored?.criteria).toEqual([{ id: "product", description: "Mention Driftwood." }]);
  expect(stored?.context).toEqual(fixture.attempt.context);
});

test("claims a ready attempt once and rejects a duplicate claim", async () => {
  const t = convexTest(schema, modules);
  const { attempt } = await seedAiReviewFixture(t);
  expect(await t.run((ctx) => claimAiReviewAttempt(ctx, attempt._id))).toMatchObject({
    status: "transcribing",
    startedAt: expect.any(Number),
  });
  await expectApiError(
    () => t.run((ctx) => claimAiReviewAttempt(ctx, attempt._id)),
    "invalid_state",
    "ai_review_stale",
  );
});

test("recording the same job ID is idempotent but replacing it is refused", async () => {
  const t = convexTest(schema, modules);
  const { attempt } = await seedAiReviewFixture(t);
  await t.run((ctx) => claimAiReviewAttempt(ctx, attempt._id));
  await t.run((ctx) => recordAiTranscriptionJob(ctx, attempt._id, "job-1"));
  await t.run((ctx) => recordAiTranscriptionJob(ctx, attempt._id, "job-1"));
  await expectApiError(
    () => t.run((ctx) => recordAiTranscriptionJob(ctx, attempt._id, "job-2")),
    "invalid_state",
    "transcription_job_mismatch",
  );
});

test("stores transcript and criterion results without approving the submission", async () => {
  const t = convexTest(schema, modules);
  const { attempt, submissionId } = await seedAiReviewFixture(t);
  await t.run(async (ctx) => {
    await claimAiReviewAttempt(ctx, attempt._id);
    await recordAiTranscriptionJob(ctx, attempt._id, "job-1");
    await saveAiTranscription(ctx, attempt._id, aiTranscriptionArgs());
    await saveAiReviewResult(ctx, attempt._id, reviewResult);
  });
  const stored = await t.run((ctx) => ctx.db.get("aiReviewAttempts", attempt._id));
  expect(stored).toMatchObject({
    status: "completed",
    transcriptionJobId: "job-1",
    transcription: { text: "Driftwood." },
    result: reviewResult,
  });
  expect(await t.run((ctx) => ctx.db.get("submissions", submissionId))).toMatchObject({
    status: "pending",
  });
});

test("cancellation prevents completion and leaves the attempt unchanged", async () => {
  const t = convexTest(schema, modules);
  const { attempt, assignmentId } = await seedAiReviewFixture(t);
  await t.run((ctx) => claimAiReviewAttempt(ctx, attempt._id));
  await t.run((ctx) => recordAiTranscriptionJob(ctx, attempt._id, "job-1"));
  await t.run((ctx) => ctx.db.patch("assignments", assignmentId, { status: "cancelled" }));
  await expectApiError(
    () => t.run((ctx) => saveAiTranscription(ctx, attempt._id, aiTranscriptionArgs())),
    "invalid_state",
    "ai_review_stale",
  );
  expect(await t.run((ctx) => ctx.db.get("aiReviewAttempts", attempt._id))).not.toHaveProperty(
    "transcription",
  );
});

test("manual review wins over a late provider result", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);
  await t.run((ctx) => claimAiReviewAttempt(ctx, fixture.attempt._id));
  await t.run((ctx) => recordAiTranscriptionJob(ctx, fixture.attempt._id, "job-1"));
  await t.run((ctx) =>
    reviewSubmission(ctx, fixture.membership, fixture.submissionId, { status: "approved" }),
  );
  await expectApiError(
    () => t.run((ctx) => saveAiTranscription(ctx, fixture.attempt._id, aiTranscriptionArgs())),
    "invalid_state",
    "ai_review_stale",
  );
});

test("provider failures preserve the pending draft for a human", async () => {
  const t = convexTest(schema, modules);
  const { attempt, submissionId } = await seedAiReviewFixture(t);
  await t.run((ctx) => markAiReviewForManualReview(ctx, attempt._id, "ambiguous_submission"));
  expect(await t.run((ctx) => ctx.db.get("aiReviewAttempts", attempt._id))).toMatchObject({
    status: "manualReview",
    failureReason: "ambiguous_submission",
  });
  expect(await t.run((ctx) => ctx.db.get("submissions", submissionId))).toMatchObject({
    status: "pending",
  });
});

test("a newer attempt invalidates the previous worker", async () => {
  const t = convexTest(schema, modules);
  const { attempt } = await seedAiReviewFixture(t);
  await t.run((ctx) => claimAiReviewAttempt(ctx, attempt._id));
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.now() + 1000);
  // A raw insert models a future explicit retry superseding a running worker.
  await t.run((ctx) =>
    ctx.db.insert("aiReviewAttempts", {
      submissionId: attempt.submissionId,
      mediaId: attempt.mediaId,
      criteria: attempt.criteria,
      context: attempt.context,
      status: "ready",
    }),
  );
  await expectApiError(
    () => t.run((ctx) => recordAiTranscriptionJob(ctx, attempt._id, "job-1")),
    "invalid_state",
    "ai_review_stale",
  );
});

test("rejects a transcript belonging to another provider job", async () => {
  const t = convexTest(schema, modules);
  const { attempt } = await seedAiReviewFixture(t);
  await t.run(async (ctx) => {
    await claimAiReviewAttempt(ctx, attempt._id);
    await recordAiTranscriptionJob(ctx, attempt._id, "job-1");
  });
  await expectApiError(
    () =>
      t.run((ctx) => saveAiTranscription(ctx, attempt._id, aiTranscriptionArgs({ id: "job-2" }))),
    "invalid_state",
    "transcription_job_mismatch",
  );
});

test("does not complete a review with missing criterion results", async () => {
  const t = convexTest(schema, modules);
  const { attempt } = await seedAiReviewFixture(t);
  await t.run(async (ctx) => {
    await claimAiReviewAttempt(ctx, attempt._id);
    await recordAiTranscriptionJob(ctx, attempt._id, "job-1");
    await saveAiTranscription(ctx, attempt._id, aiTranscriptionArgs());
  });
  await expectApiError(
    () =>
      t.run((ctx) =>
        saveAiReviewResult(ctx, attempt._id, {
          model: "jev-1.14.0",
          inputTokens: 100,
          outputTokens: 10,
          results: [],
        }),
      ),
    "invalid_state",
    "review_result_mismatch",
  );
  expect(await t.run((ctx) => ctx.db.get("aiReviewAttempts", attempt._id))).toMatchObject({
    status: "evaluating",
  });
});

test("rejects same-count results with an unrelated criterion ID", async () => {
  const t = convexTest(schema, modules);
  const { attempt } = await seedAiReviewFixture(t, reviewCriteria);
  await t.run(async (ctx) => {
    await claimAiReviewAttempt(ctx, attempt._id);
    await recordAiTranscriptionJob(ctx, attempt._id, "job-1");
    await saveAiTranscription(ctx, attempt._id, aiTranscriptionArgs());
  });
  await expectApiError(
    () =>
      t.run((ctx) =>
        saveAiReviewResult(ctx, attempt._id, {
          ...reviewResult,
          results: [
            reviewResult.results[0],
            { ...reviewResult.results[0], criterionId: "unrelated" },
          ],
        }),
      ),
    "invalid_state",
    "review_result_mismatch",
  );
  const stored = await t.run((ctx) => ctx.db.get("aiReviewAttempts", attempt._id));
  expect(stored?.status).toBe("evaluating");
  expect(stored).not.toHaveProperty("result");
});

test("rejects extra criterion results", async () => {
  const t = convexTest(schema, modules);
  const { attempt } = await seedAiReviewFixture(t, reviewCriteria);
  await t.run(async (ctx) => {
    await claimAiReviewAttempt(ctx, attempt._id);
    await recordAiTranscriptionJob(ctx, attempt._id, "job-1");
    await saveAiTranscription(ctx, attempt._id, aiTranscriptionArgs());
  });
  await expectApiError(
    () =>
      t.run((ctx) =>
        saveAiReviewResult(ctx, attempt._id, {
          ...reviewResult,
          results: [
            reviewResult.results[0],
            { ...reviewResult.results[0], criterionId: "disclosure" },
            { ...reviewResult.results[0], criterionId: "extra" },
          ],
        }),
      ),
    "invalid_state",
    "review_result_mismatch",
  );
  const stored = await t.run((ctx) => ctx.db.get("aiReviewAttempts", attempt._id));
  expect(stored?.status).toBe("evaluating");
  expect(stored).not.toHaveProperty("result");
});

test("rejects duplicate criterion IDs even when every expected ID is present", async () => {
  const t = convexTest(schema, modules);
  const { attempt } = await seedAiReviewFixture(t, reviewCriteria);
  await t.run(async (ctx) => {
    await claimAiReviewAttempt(ctx, attempt._id);
    await recordAiTranscriptionJob(ctx, attempt._id, "job-1");
    await saveAiTranscription(ctx, attempt._id, aiTranscriptionArgs());
  });
  await expectApiError(
    () =>
      t.run((ctx) =>
        saveAiReviewResult(ctx, attempt._id, {
          ...reviewResult,
          results: [
            reviewResult.results[0],
            { ...reviewResult.results[0], criterionId: "disclosure" },
            reviewResult.results[0],
          ],
        }),
      ),
    "invalid_state",
    "review_result_mismatch",
  );
  const stored = await t.run((ctx) => ctx.db.get("aiReviewAttempts", attempt._id));
  expect(stored?.status).toBe("evaluating");
  expect(stored).not.toHaveProperty("result");
});

test("requires confirmed criteria and rolls back an ineligible media draft", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAssignmentFixture(t, { usesAiReview: true });
  const mediaId = await seedSubmissionVideo(t, fixture);
  await expectApiError(
    () =>
      t.run((ctx) =>
        createSubmission(
          ctx,
          fixture.creatorId,
          submissionArgs(fixture, { draftUrl: undefined, mediaId }),
        ),
      ),
    "invalid_state",
    "ai_review_criteria_required",
  );
  expect(
    await t.run((ctx) =>
      ctx.db
        .query("submissions")
        .withIndex("by_assignmentId_and_deliverableId", (q) =>
          q.eq("assignmentId", fixture.assignmentId).eq("deliverableId", fixture.deliverableId),
        )
        .first(),
    ),
  ).toBeNull();
});
