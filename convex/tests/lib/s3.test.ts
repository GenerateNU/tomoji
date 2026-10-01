import { CopyObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { describe, expect, test, vi } from "vitest";
import {
  createMediaUploadGrant,
  inspectMediaObject,
  mediaLimits,
  promoteMediaObject,
  readMediaConfig,
} from "../../lib/s3";

const config = { bucket: "tomoji-dev-media-test", region: "us-east-1" };

function client() {
  return new S3Client({
    region: config.region,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  });
}

describe("readMediaConfig", () => {
  test("requires a bucket and region without exposing credentials", () => {
    expect(() => readMediaConfig({ S3_MEDIA_BUCKET: "", S3_MEDIA_REGION: "us-east-1" })).toThrow();
    expect(
      readMediaConfig({ S3_MEDIA_BUCKET: config.bucket, S3_MEDIA_REGION: config.region }),
    ).toEqual(config);
  });
});

describe("promoteMediaObject", () => {
  test("copies the verified staging object to a permanent key using its ETag", async () => {
    const s3 = client();
    const send = vi
      .spyOn(s3, "send")
      .mockResolvedValue({ CopyObjectResult: { ETag: '"abc"' } } as never);
    const source = {
      key: "staging/profile-picture/123",
      contentType: "image/webp",
      size: 100,
      etag: '"abc"',
    };

    await expect(
      promoteMediaObject(s3, config, source, "profile-picture", "media/profile-picture/456"),
    ).resolves.toBe("media/profile-picture/456");
    const command = send.mock.calls[0]?.[0];
    expect(command).toBeInstanceOf(CopyObjectCommand);
    expect((command as CopyObjectCommand).input).toMatchObject({
      Bucket: config.bucket,
      Key: "media/profile-picture/456",
      CopySource: `${config.bucket}/${source.key}`,
      CopySourceIfMatch: '"abc"',
    });
  });

  test("refuses an invalid destination without copying", async () => {
    const s3 = client();
    const send = vi.spyOn(s3, "send");
    await expect(
      promoteMediaObject(
        s3,
        config,
        { key: "staging/video-submission/123", contentType: "video/mp4", size: 100, etag: '"abc"' },
        "video-submission",
        "staging/video-submission/other",
      ),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("createMediaUploadGrant", () => {
  test("signs a short-lived, size-limited profile picture upload into a server-owned key", async () => {
    const grant = await createMediaUploadGrant(client(), config, "profile-picture", "image/webp");
    const policy = JSON.parse(atob(grant.fields.Policy));

    expect(grant.key).toMatch(/^staging\/profile-picture\/[0-9a-f-]+$/);
    expect(grant.fields.key).toBe(grant.key);
    expect(grant.fields["Content-Type"]).toBe("image/webp");
    expect(policy.conditions).toContainEqual([
      "content-length-range",
      1,
      mediaLimits["profile-picture"],
    ]);
    expect(policy.conditions).toContainEqual({ "Content-Type": "image/webp" });
    expect(grant.url).toContain(config.bucket);
  });

  test("rejects unsupported media types before issuing a grant", async () => {
    await expect(
      createMediaUploadGrant(client(), config, "profile-picture", "image/svg+xml"),
    ).rejects.toThrow();
    await expect(
      createMediaUploadGrant(client(), config, "video-submission", "text/html"),
    ).rejects.toThrow();
  });
});

describe("inspectMediaObject", () => {
  test("accepts an uploaded object with allowed metadata and size", async () => {
    const s3 = client();
    vi.spyOn(s3, "send").mockResolvedValue({
      ContentLength: 100,
      ContentType: "video/mp4",
      ETag: '"abc"',
    } as never);

    await expect(
      inspectMediaObject(s3, config, "staging/video-submission/123", "video-submission"),
    ).resolves.toEqual({
      key: "staging/video-submission/123",
      contentType: "video/mp4",
      size: 100,
      etag: '"abc"',
    });
  });

  test("rejects a mismatched prefix before calling S3", async () => {
    const s3 = client();
    const send = vi.spyOn(s3, "send");

    await expect(
      inspectMediaObject(s3, config, "staging/profile-picture/123", "video-submission"),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  test("rejects an oversized object even when S3 metadata reports an allowed type", async () => {
    const s3 = client();
    vi.spyOn(s3, "send").mockResolvedValue({
      ContentLength: mediaLimits["profile-picture"] + 1,
      ContentType: "image/jpeg",
    } as never);

    await expect(
      inspectMediaObject(s3, config, "staging/profile-picture/123", "profile-picture"),
    ).rejects.toThrow();
  });
});
