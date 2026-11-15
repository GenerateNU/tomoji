/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import schema from "../../schema";
import { createSubmission, reviewSubmission, finishAiReview } from "../../models/submissions";
import {
  completeAiReviewWorkflow,
  expireAiReview,
  markAiReviewForManualReview,
  reserveAiTranscription,
  claimAiReviewAttempt,
  createAiReviewAttempt,
  recordAiTranscriptionJob,
  saveAiTranscription,
} from "../../models/aiReviewAttempts";
import {
  aiReviewResultArgs,
  prepareAiReviewEvaluation,
  creatorNotifications,
  memberNotifications,
  seedAssignmentFixture,
  submissionArgs,
  seedAiReviewFixture,
  seedSubmissionVideo,
  expectApiError,
  aiTranscriptionArgs,
} from "../helpers";

const modules = import.meta.glob("../../**/*.ts");
const reviewResult = aiReviewResultArgs({ outputTokens: 10 });
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
      reviewPolicy: "Disclose the paid partnership. Do not promise zero downtime.",
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

test("stores transcript and criterion results with the automatic approval", async () => {
  const t = convexTest(schema, modules);
  const { attempt, submissionId } = await seedAiReviewFixture(t);
  await t.run(async (ctx) => {
    await claimAiReviewAttempt(ctx, attempt._id);
    await recordAiTranscriptionJob(ctx, attempt._id, "job-1");
    await saveAiTranscription(ctx, attempt._id, aiTranscriptionArgs());
    await finishAiReview(ctx, attempt._id, reviewResult);
  });
  const stored = await t.run((ctx) => ctx.db.get("aiReviewAttempts", attempt._id));
  expect(stored).toMatchObject({
    status: "completed",
    transcriptionJobId: "job-1",
    transcription: { text: "Driftwood." },
    result: reviewResult,
  });
  expect(await t.run((ctx) => ctx.db.get("submissions", submissionId))).toMatchObject({
    status: "approved",
    reviewerType: "ai",
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
        finishAiReview(ctx, attempt._id, {
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
        finishAiReview(ctx, attempt._id, {
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
        finishAiReview(ctx, attempt._id, {
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
        finishAiReview(ctx, attempt._id, {
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
  const fixture = await seedAssignmentFixture(t, {
    usesAiReview: true,
    opportunity: {
      usesAiReviewDefault: false,
      deliverables: [{ title: "Video", description: "Show the product." }],
    },
  });
  const mediaId = await seedSubmissionVideo(t, fixture);
  await expectApiError(
    () =>
      t.run((ctx) =>
        createSubmission(ctx, fixture.creatorId, submissionArgs(fixture, { mediaId })),
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

test("commits approval and one creator notification atomically, rejecting duplicate completion", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);
  await prepareAiReviewEvaluation(t, fixture.attempt._id);
  await t.run(async (ctx) => {
    await finishAiReview(ctx, fixture.attempt._id, reviewResult);
  });
  expect(await t.run((ctx) => ctx.db.get("submissions", fixture.submissionId))).toMatchObject({
    status: "approved",
    reviewerType: "ai",
    reviewedAt: expect.any(Number),
  });
  await expectApiError(
    () => t.run((ctx) => finishAiReview(ctx, fixture.attempt._id, reviewResult)),
    "invalid_state",
    "ai_review_stale",
  );
  const notifications = await creatorNotifications(t, fixture.creatorId);
  expect(notifications.filter((n) => n.type === "submissionApproved")).toHaveLength(1);
});

test("fallback is idempotent and permits company review without accepting a late AI result", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);
  await t.run((ctx) => claimAiReviewAttempt(ctx, fixture.attempt._id));
  await t.run((ctx) => markAiReviewForManualReview(ctx, fixture.attempt._id, "timeout"));
  await t.run((ctx) => markAiReviewForManualReview(ctx, fixture.attempt._id, "timeout"));
  await t.run((ctx) =>
    reviewSubmission(ctx, fixture.membership, fixture.submissionId, { status: "approved" }),
  );
  await expectApiError(
    () => t.run((ctx) => finishAiReview(ctx, fixture.attempt._id, reviewResult)),
    "invalid_state",
    "ai_review_stale",
  );
});

test("a dispatched transcription cannot be submitted twice", async () => {
  const t = convexTest(schema, modules);
  const { attempt } = await seedAiReviewFixture(t);
  await t.run((ctx) => claimAiReviewAttempt(ctx, attempt._id));
  expect(await t.run((ctx) => reserveAiTranscription(ctx, attempt._id))).toBe(true);
  expect(await t.run((ctx) => reserveAiTranscription(ctx, attempt._id))).toBe(false);
});

test("a confident unmet criterion requests actionable changes and notifies the creator", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);
  await prepareAiReviewEvaluation(t, fixture.attempt._id);
  await t.run(async (ctx) => {
    await finishAiReview(ctx, fixture.attempt._id, {
      ...reviewResult,
      results: [
        {
          ...reviewResult.results[0],
          outcome: "not_met",
          probabilities: { met: 0.02, not_met: 0.95, uncertain: 0.03 },
        },
      ],
    });
  });
  expect(await t.run((ctx) => ctx.db.get("submissions", fixture.submissionId))).toMatchObject({
    status: "changesRequested",
    reviewerType: "ai",
    reviewNote: "Please address these requirements: Mention Driftwood.",
  });
  expect(await creatorNotifications(t, fixture.creatorId)).toContainEqual(
    expect.objectContaining({
      type: "submissionChangesRequested",
      body: "Please address these requirements: Mention Driftwood.",
    }),
  );
});

test("cancellation prevents AI approval and fallback does not ask the company to review a closed assignment", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);
  await prepareAiReviewEvaluation(t, fixture.attempt._id);
  await t.run(async (ctx) => {
    await ctx.db.patch("assignments", fixture.assignmentId, { status: "cancelled" });
  });
  const before = await memberNotifications(t, fixture.membership);
  await expectApiError(
    () => t.run((ctx) => finishAiReview(ctx, fixture.attempt._id, reviewResult)),
    "invalid_state",
    "ai_review_stale",
  );
  await t.run((ctx) => markAiReviewForManualReview(ctx, fixture.attempt._id, "review_failed"));
  expect(await memberNotifications(t, fixture.membership)).toEqual(before);
  expect(await t.run((ctx) => ctx.db.get("submissions", fixture.submissionId))).toMatchObject({
    status: "pending",
  });
});

test("the deadline releases a stopped worker and a late job cannot revive it", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);
  await t.run((ctx) =>
    ctx.db.patch("aiReviewAttempts", fixture.attempt._id, {
      status: "transcribing",
      deadlineAt: Date.now() + 1000,
    }),
  );
  await t.run((ctx) => expireAiReview(ctx, fixture.attempt._id));
  expect((await t.run((ctx) => ctx.db.get("aiReviewAttempts", fixture.attempt._id)))?.status).toBe(
    "transcribing",
  );
  vi.setSystemTime(Date.now() + 1000);
  await t.run((ctx) => expireAiReview(ctx, fixture.attempt._id));
  expect(
    (await t.run((ctx) => ctx.db.get("aiReviewAttempts", fixture.attempt._id)))?.failureReason,
  ).toBe("timeout");
  await expectApiError(
    () => t.run((ctx) => recordAiTranscriptionJob(ctx, fixture.attempt._id, "late-job")),
    "invalid_state",
    "ai_review_stale",
  );
});

test("a stale workflow callback cannot release the current review", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);
  await t.run((ctx) =>
    ctx.db.patch("aiReviewAttempts", fixture.attempt._id, { workflowId: "current-workflow" }),
  );
  await t.run((ctx) => completeAiReviewWorkflow(ctx, fixture.attempt._id, "old-workflow"));
  expect(await t.run((ctx) => ctx.db.get("aiReviewAttempts", fixture.attempt._id))).toMatchObject({
    status: "ready",
    workflowId: "current-workflow",
  });
  await t.run((ctx) => completeAiReviewWorkflow(ctx, fixture.attempt._id, "current-workflow"));
  expect(await t.run((ctx) => ctx.db.get("aiReviewAttempts", fixture.attempt._id))).toMatchObject({
    status: "manualReview",
    failureReason: "review_failed",
  });
});
