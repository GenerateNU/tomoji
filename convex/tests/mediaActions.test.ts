/// <reference types="vite/client" />
import {
  CopyObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "../_generated/api";
import { apiError } from "../lib/errors";
import schema from "../schema";
import {
  expectApiError,
  seedAssignment,
  seedCreatorId,
  seedOpportunity,
  seedProfilePictureUpload,
  seedUser,
  workosIdentity,
} from "./helpers";

const modules = import.meta.glob("../**/*.ts");

describe("S3 failure translation", () => {
  beforeEach(() => {
    vi.stubEnv("S3_MEDIA_BUCKET", "tomoji-dev-media-test");
    vi.stubEnv("S3_MEDIA_REGION", "us-east-1");
  });

  test("a changed staging object fails completion with upload_mismatch", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, uploadId } = await seedProfilePictureUpload(t, "media_copy_changed");
    vi.spyOn(S3Client.prototype, "send")
      .mockResolvedValueOnce({
        ContentLength: 3,
        ContentType: "image/webp",
        ETag: '"abc"',
      } as never)
      .mockRejectedValueOnce(
        Object.assign(new Error("precondition failed"), {
          $metadata: { httpStatusCode: 412 },
        }),
      );

    await expect(asCreator.action(api.media.completeUpload, { uploadId })).rejects.toThrow(
      /"reason":"upload_mismatch"/,
    );
    const upload = await t.run((ctx) => ctx.db.get("mediaUploads", uploadId));
    expect(upload?.status).toBe("pending");
  });

  test("an S3 copy failure is reported as upstream_failure", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, uploadId } = await seedProfilePictureUpload(t, "media_copy_failed");
    vi.spyOn(S3Client.prototype, "send")
      .mockResolvedValueOnce({
        ContentLength: 3,
        ContentType: "image/webp",
        ETag: '"abc"',
      } as never)
      .mockRejectedValueOnce(new Error("S3 unavailable"));

    await expectApiError(
      () => asCreator.action(api.media.completeUpload, { uploadId }),
      "upstream_failure",
    );
    expect((await t.run((ctx) => ctx.db.get("mediaUploads", uploadId)))?.status).toBe("pending");
  });

  test("completion preserves a structured error from the copy helper", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, uploadId } = await seedProfilePictureUpload(t, "media_copy_structured");
    vi.spyOn(S3Client.prototype, "send")
      .mockResolvedValueOnce({
        ContentLength: 3,
        ContentType: "image/webp",
        ETag: '"abc"',
      } as never)
      .mockRejectedValueOnce(apiError("not_found", { resource: "media" }));

    await expectApiError(
      () => asCreator.action(api.media.completeUpload, { uploadId }),
      "not_found",
    );
  });

  test("a profile-picture S3 request failure is reported as upstream_failure", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, uploadId } = await seedProfilePictureUpload(
      t,
      "media_get_failed",
      "complete",
    );
    vi.spyOn(S3Client.prototype, "send").mockRejectedValueOnce(new Error("S3 unavailable"));

    await expectApiError(
      () => asCreator.action(api.media.getProfilePicture, { mediaId: uploadId }),
      "upstream_failure",
    );
  });

  test("a profile-picture body read failure is reported as upstream_failure", async () => {
    const t = convexTest(schema, modules);
    const { asCreator, uploadId } = await seedProfilePictureUpload(
      t,
      "media_body_failed",
      "complete",
    );
    vi.spyOn(S3Client.prototype, "send").mockResolvedValueOnce({
      ContentLength: 3,
      ContentType: "image/webp",
      Body: {
        transformToByteArray: async () => {
          throw new Error("connection closed");
        },
      },
    } as never);

    await expectApiError(
      () => asCreator.action(api.media.getProfilePicture, { mediaId: uploadId }),
      "upstream_failure",
    );
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

test("media.requestUpload rejects a signed-out caller before contacting S3", async () => {
  const t = convexTest(schema, modules);
  await expectApiError(
    () => t.action(api.media.requestUpload, { kind: "profile-picture", contentType: "image/webp" }),
    "not_authenticated",
  );
});

test("a creator uploads and retrieves a private profile picture by its media ID", async () => {
  vi.stubEnv("S3_MEDIA_BUCKET", "tomoji-dev-media-test");
  vi.stubEnv("S3_MEDIA_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test");
  const send = vi
    .spyOn(S3Client.prototype, "send")
    .mockResolvedValueOnce({ ContentLength: 3, ContentType: "image/webp", ETag: '"abc"' } as never)
    .mockResolvedValueOnce({ CopyObjectResult: { ETag: '"abc"' } } as never)
    .mockResolvedValueOnce({
      ContentLength: 3,
      ContentType: "image/webp",
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    } as never);

  const t = convexTest(schema, modules);
  const asCreator = await seedUser(t, { subject: "media_creator" });
  const grant = await asCreator.action(api.media.requestUpload, {
    kind: "profile-picture",
    contentType: "image/webp",
  });
  expect(grant.url).toContain("tomoji-dev-media-test");
  expect(grant.fields.key).toMatch(/^staging\/profile-picture\/[0-9a-f-]+$/);

  const result = await asCreator.action(api.media.completeUpload, { uploadId: grant.uploadId });
  expect(result).toEqual({ mediaId: grant.uploadId, kind: "profile-picture" });
  expect(await asCreator.action(api.media.completeUpload, { uploadId: grant.uploadId })).toEqual(
    result,
  );
  const picture = await asCreator.action(api.media.getProfilePicture, { mediaId: grant.uploadId });
  expect(picture.contentType).toBe("image/webp");
  expect(new Uint8Array(picture.bytes)).toEqual(new Uint8Array([1, 2, 3]));
  expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  expect(send.mock.calls[1]?.[0]).toBeInstanceOf(CopyObjectCommand);
  expect(send.mock.calls[2]?.[0]).toBeInstanceOf(GetObjectCommand);
  expect(send).toHaveBeenCalledTimes(3);
});

test("a video grant is bound to an active assignment and its creator", async () => {
  vi.stubEnv("S3_MEDIA_BUCKET", "tomoji-dev-media-test");
  vi.stubEnv("S3_MEDIA_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test");
  const send = vi
    .spyOn(S3Client.prototype, "send")
    .mockResolvedValueOnce({ ContentLength: 100, ContentType: "video/mp4", ETag: '"abc"' } as never)
    .mockResolvedValueOnce({ CopyObjectResult: { ETag: '"abc"' } } as never);

  const t = convexTest(schema, modules);
  const creatorId = await seedCreatorId(t, "video_creator");
  const asCreator = t.withIdentity(workosIdentity({ subject: "video_creator" }));
  const otherCreator = await seedUser(t, { subject: "video_other_creator" });
  const otherCompany = await seedUser(t, {
    subject: "video_other_company",
    org: { id: "org_video_other" },
  });
  const { asCompany, opportunityId } = await seedOpportunity(t, { subject: "video_company" });
  const assignmentId = await seedAssignment(t, {
    opportunityId,
    creatorId,
    status: "active",
  });

  await expectApiError(
    () =>
      otherCreator.action(api.media.requestUpload, {
        kind: "video-submission",
        contentType: "video/mp4",
        assignmentId,
      }),
    "not_found",
  );
  const grant = await asCreator.action(api.media.requestUpload, {
    kind: "video-submission",
    contentType: "video/mp4",
    assignmentId,
  });
  await expectApiError(
    () => otherCreator.action(api.media.completeUpload, { uploadId: grant.uploadId }),
    "not_found",
  );
  await asCreator.action(api.media.completeUpload, { uploadId: grant.uploadId });

  expect(
    (await asCreator.action(api.media.getVideoUrl, { mediaId: grant.uploadId })).url,
  ).toContain("tomoji-dev-media-test");
  expect(
    (await asCompany.action(api.media.getVideoUrl, { mediaId: grant.uploadId })).url,
  ).toContain("tomoji-dev-media-test");
  await expectApiError(
    () => otherCompany.action(api.media.getVideoUrl, { mediaId: grant.uploadId }),
    "not_found",
  );
  expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  expect(send.mock.calls[1]?.[0]).toBeInstanceOf(CopyObjectCommand);
  expect(send).toHaveBeenCalledTimes(2);
});

test("a missing S3 object cannot become a profile picture", async () => {
  vi.stubEnv("S3_MEDIA_BUCKET", "tomoji-dev-media-test");
  vi.stubEnv("S3_MEDIA_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test");
  const t = convexTest(schema, modules);
  const asCreator = await seedUser(t, { subject: "media_missing" });
  const grant = await asCreator.action(api.media.requestUpload, {
    kind: "profile-picture",
    contentType: "image/webp",
  });
  const missing = Object.assign(new Error("not found"), { $metadata: { httpStatusCode: 404 } });
  vi.spyOn(S3Client.prototype, "send").mockRejectedValueOnce(missing);

  await expectApiError(
    () => asCreator.action(api.media.completeUpload, { uploadId: grant.uploadId }),
    "invalid_state",
  );
  const state = await asCreator.run(async (ctx) => ({
    upload: await ctx.db.get("mediaUploads", grant.uploadId),
    users: await ctx.db
      .query("users")
      .withIndex("by_workosId", (q) => q.eq("workosId", "media_missing"))
      .unique(),
  }));
  expect(state.upload?.status).toBe("pending");
  expect(state.users?.profilePictureMediaId).toBeUndefined();
});
