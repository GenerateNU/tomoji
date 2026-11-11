/// <reference types="vite/client" />
import workflowTest from "@convex-dev/workflow/test";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { enqueueAiReview } from "../models/aiReviewAttempts";
import {
  type TestConvex,
  assemblyTranscriptResponse,
  seedAiReviewFixture,
  seedOperator,
  expectApiError,
  jevReviewResponse,
  memberNotifications,
  creatorNotifications,
} from "./helpers";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://private-video.example/signed"),
}));
const modules = import.meta.glob("../**/*.ts");

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("AI_REVIEW_ENABLED", "false");
  vi.stubEnv("ASSEMBLYAI_API_KEY", "assembly-test");
  vi.stubEnv("TYPESAFE_API_KEY", "jev-test");
  vi.stubEnv("X_BEARER_TOKEN", "x-test");
  vi.stubEnv("S3_MEDIA_BUCKET", "test-media");
  vi.stubEnv("S3_MEDIA_REGION", "us-east-1");
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const metAnswers = {
  criterion_0: {
    type: "choice",
    choice: "met",
    confidence: 0.9,
    probabilities: { met: 0.95, not_met: 0.03, uncertain: 0.02 },
  },
};

/** Advances the workflow without skipping past its timeout while an action is still running. */
async function finishReview(t: TestConvex, attemptId: Id<"aiReviewAttempts">) {
  return await vi.waitUntil(
    async () => {
      await t.finishInProgressScheduledFunctions();
      const attempt = await t.run((ctx) => ctx.db.get("aiReviewAttempts", attemptId));
      if (attempt?.status === "completed" || attempt?.status === "manualReview") return attempt;
      await vi.advanceTimersByTimeAsync(1000);
      return false;
    },
    { interval: 1, timeout: 2000 },
  );
}

test("runs the queued review end to end using mocked S3 and providers", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const fixture = await seedAiReviewFixture(t);
  vi.stubEnv("AI_REVIEW_ENABLED", "true");
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ id: "job-1" }))
    .mockResolvedValueOnce(assemblyTranscriptResponse({ id: "job-1" }))
    .mockResolvedValueOnce(jevReviewResponse({ answers: metAnswers }));
  await t.run((ctx) => enqueueAiReview(ctx, fixture.attempt._id));
  const attempt = await finishReview(t, fixture.attempt._id);
  expect(attempt).toMatchObject({
    status: "completed",
    transcriptionJobId: "job-1",
    result: { model: "jev-1.14.0" },
  });
  expect(await t.run((ctx) => ctx.db.get("submissions", fixture.submissionId))).toMatchObject({
    status: "approved",
    reviewerType: "ai",
  });
  expect(fetch).toHaveBeenCalledTimes(3);
  const jevBody = JSON.parse(String(vi.mocked(fetch).mock.calls[2][1]?.body));
  expect(jevBody.state.context).toEqual(fixture.attempt.context);
  const view = await fixture.asCreator.query(api.submissions.get, {
    submissionId: fixture.submissionId,
  });
  expect(view.aiReview).toEqual({
    status: "completed",
    results: [{ criterionId: "product", outcome: "met" }],
  });
  expect(view).not.toHaveProperty("transcription");
  expect(view).not.toHaveProperty("workflowId");
});

test("does not resubmit an ambiguous transcription request", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const fixture = await seedAiReviewFixture(t);
  vi.stubEnv("AI_REVIEW_ENABLED", "true");
  vi.mocked(fetch).mockRejectedValue(new Error("connection lost with secret-url"));
  await t.run((ctx) => enqueueAiReview(ctx, fixture.attempt._id));
  expect(await finishReview(t, fixture.attempt._id)).toMatchObject({
    status: "manualReview",
    failureReason: "ambiguous_submission",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(await t.run((ctx) => ctx.db.get("submissions", fixture.submissionId))).toMatchObject({
    status: "pending",
  });
});

test("retries a Jev rate-limit rejection without transcribing again", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const fixture = await seedAiReviewFixture(t);
  vi.stubEnv("AI_REVIEW_ENABLED", "true");
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ id: "job-1" }))
    .mockResolvedValueOnce(assemblyTranscriptResponse({ id: "job-1" }))
    .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
    .mockResolvedValueOnce(jevReviewResponse({ answers: metAnswers }));
  await t.run((ctx) => enqueueAiReview(ctx, fixture.attempt._id));
  expect(await finishReview(t, fixture.attempt._id)).toMatchObject({ status: "completed" });
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(
    vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url) === "https://api.assemblyai.com/v2/transcript"),
  ).toHaveLength(1);
});

test("long videos fall back instead of receiving an automatic decision", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const fixture = await seedAiReviewFixture(t);
  vi.stubEnv("AI_REVIEW_ENABLED", "true");
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ id: "job-1" }))
    .mockResolvedValueOnce(assemblyTranscriptResponse({ id: "job-1", audio_duration: 301 }));
  await t.run((ctx) => enqueueAiReview(ctx, fixture.attempt._id));
  expect(await finishReview(t, fixture.attempt._id)).toMatchObject({
    status: "manualReview",
    failureReason: "duration_exceeded",
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("enqueuing twice retains the original workflow", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const fixture = await seedAiReviewFixture(t);
  await t.run((ctx) => enqueueAiReview(ctx, fixture.attempt._id));
  const initial = await t.run((ctx) => ctx.db.get("aiReviewAttempts", fixture.attempt._id));
  expect(initial?.workflowId).toEqual(expect.any(String));
  await t.run((ctx) => enqueueAiReview(ctx, fixture.attempt._id));
  expect(await t.run((ctx) => ctx.db.get("aiReviewAttempts", fixture.attempt._id))).toEqual(
    initial,
  );
  await finishReview(t, fixture.attempt._id);
  expect(fetch).not.toHaveBeenCalled();
});

test("an enabled submission queues in its creation transaction and notifies the creator only after review", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  vi.stubEnv("AI_REVIEW_ENABLED", "true");
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ id: "job-1" }))
    .mockResolvedValueOnce(assemblyTranscriptResponse({ id: "job-1" }))
    .mockResolvedValueOnce(jevReviewResponse({ answers: metAnswers }));
  const fixture = await seedAiReviewFixture(t);
  expect(fixture.attempt.workflowId).toEqual(expect.any(String));
  const before = await memberNotifications(t, fixture.membership);
  expect(before.filter((n) => n.type === "submissionCreated")).toHaveLength(0);
  await finishReview(t, fixture.attempt._id);
  const notifications = await creatorNotifications(t, fixture.creatorId);
  expect(notifications.filter((n) => n.type === "submissionApproved")).toHaveLength(1);
});

test("uncertain speech remains pending and notifies the company once", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  vi.stubEnv("AI_REVIEW_ENABLED", "true");
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ id: "job-1" }))
    .mockResolvedValueOnce(assemblyTranscriptResponse({ id: "job-1" }))
    .mockResolvedValueOnce(jevReviewResponse());
  const fixture = await seedAiReviewFixture(t);
  expect(await finishReview(t, fixture.attempt._id)).toMatchObject({
    status: "manualReview",
    failureReason: "uncertain",
  });
  expect(await t.run((ctx) => ctx.db.get("submissions", fixture.submissionId))).toMatchObject({
    status: "pending",
  });
  const notifications = await memberNotifications(t, fixture.membership);
  expect(notifications.filter((n) => n.type === "submissionCreated")).toHaveLength(1);
  await t.mutation(internal.aiReviewInternal.fallback, {
    attemptId: fixture.attempt._id,
    reason: "review_failed",
  });
  expect(await memberNotifications(t, fixture.membership)).toEqual(notifications);
});

test("silence falls back without sending empty evidence to Jev", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const fixture = await seedAiReviewFixture(t);
  vi.stubEnv("AI_REVIEW_ENABLED", "true");
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ id: "job-1" }))
    .mockResolvedValueOnce(assemblyTranscriptResponse({ id: "job-1", text: null, words: null }));
  await t.run((ctx) => enqueueAiReview(ctx, fixture.attempt._id));
  expect(await finishReview(t, fixture.attempt._id)).toMatchObject({
    status: "manualReview",
    failureReason: "no_speech",
  });
  expect(fetch).toHaveBeenCalledTimes(2);
});

test("disabling a queued workflow sends no provider requests", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const fixture = await seedAiReviewFixture(t);
  await t.run((ctx) => enqueueAiReview(ctx, fixture.attempt._id));
  expect(await finishReview(t, fixture.attempt._id)).toMatchObject({
    status: "manualReview",
    failureReason: "disabled",
  });
  expect(fetch).not.toHaveBeenCalled();
});

test("an expired worker does not call a provider even before its deadline job runs", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedAiReviewFixture(t);
  vi.stubEnv("AI_REVIEW_ENABLED", "true");
  await t.run((ctx) =>
    ctx.db.patch("aiReviewAttempts", fixture.attempt._id, {
      status: "transcribing",
      transcriptionJobId: "job-1",
      deadlineAt: Date.now() - 1,
    }),
  );
  expect(
    await t.action(internal.aiReviewActions.poll, { attemptId: fixture.attempt._id }),
  ).toMatchObject({ ok: false, retryable: false });
  expect(fetch).not.toHaveBeenCalled();
});

test("does not repeat a possibly billed Jev request after a server error", async () => {
  const t = convexTest(schema, modules);
  workflowTest.register(t);
  const fixture = await seedAiReviewFixture(t);
  vi.stubEnv("AI_REVIEW_ENABLED", "true");
  vi.mocked(fetch)
    .mockResolvedValueOnce(Response.json({ id: "job-1" }))
    .mockResolvedValueOnce(assemblyTranscriptResponse({ id: "job-1" }))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  await t.run((ctx) => enqueueAiReview(ctx, fixture.attempt._id));
  expect(await finishReview(t, fixture.attempt._id)).toMatchObject({
    status: "manualReview",
    failureReason: "ambiguous_submission",
  });
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(await t.run((ctx) => ctx.db.get("submissions", fixture.submissionId))).toMatchObject({
    status: "pending",
  });
});

/** Records an X post through the normal approval and posting routes. */
async function seedPublishedAiReviewPost(t: TestConvex) {
  const fixture = await seedAiReviewFixture(t);
  await fixture.asCompany.mutation(api.submissions.review, {
    submissionId: fixture.submissionId,
    review: { status: "approved" },
  });
  const postId = await fixture.asCreator.mutation(api.posts.create, {
    submissionId: fixture.submissionId,
    url: "https://x.com/creator/status/123",
  });
  vi.stubEnv("AI_REVIEW_ENABLED", "true");
  return { ...fixture, postId };
}

test("reviews the published X caption alongside the saved draft transcript", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedPublishedAiReviewPost(t);
  const operator = await seedOperator(t, "caption-operator");
  await t.run(async (ctx) => {
    await ctx.db.patch("aiReviewAttempts", fixture.attempt._id, {
      transcription: {
        id: "draft-transcript",
        status: "completed",
        text: "Here is a quick demo.",
        words: [],
        durationSeconds: 12,
        model: "test",
      },
    });
  });
  vi.mocked(fetch)
    .mockResolvedValueOnce(
      Response.json({
        data: {
          id: "123",
          text: "Preview of a longer post.",
          note_post: { text: "A full tutorial for Driftwood. #ad" },
        },
      }),
    )
    .mockResolvedValueOnce(jevReviewResponse({ answers: metAnswers }));
  expect(
    await operator.action(api.aiReviewActions.reviewPost, { postId: fixture.postId }),
  ).toMatchObject({
    results: [{ criterionId: "product", outcome: "met" }],
  });

  const [[xUrl, xRequest], [, jevRequest]] = vi.mocked(fetch).mock.calls;
  expect(new Headers(xRequest?.headers).get("Authorization")).toBe("Bearer x-test");
  expect(xUrl).toBe("https://api.x.com/2/tweets/123?tweet.fields=note_post");
  expect(JSON.parse(String(jevRequest?.body)).state).toMatchObject({
    transcript: "Here is a quick demo.",
    postText: "A full tutorial for Driftwood. #ad",
  });
  expect(await t.run((ctx) => ctx.db.get("posts", fixture.postId))).toMatchObject({
    isVerified: false,
  });
});

test("rejects creator requests for a published caption review before calling providers", async () => {
  const t = convexTest(schema, modules);
  const { asCreator, postId } = await seedPublishedAiReviewPost(t);
  await expectApiError(
    () => asCreator.action(api.aiReviewActions.reviewPost, { postId }),
    "forbidden",
  );
  expect(fetch).not.toHaveBeenCalled();
});

test("rejects a mismatched X post before sending its text to Jev", async () => {
  const t = convexTest(schema, modules);
  const fixture = await seedPublishedAiReviewPost(t);
  const operator = await seedOperator(t, "caption-mismatch-operator");
  vi.mocked(fetch).mockResolvedValueOnce(
    Response.json({
      data: { id: "456", text: "A different post." },
    }),
  );
  await expectApiError(
    () => operator.action(api.aiReviewActions.reviewPost, { postId: fixture.postId }),
    "upstream_failure",
    "invalid_response",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
});
