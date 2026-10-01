import { CopyObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { apiError } from "./errors";

export type MediaKind = "profile-picture" | "video-submission";

export const mediaLimits = {
  // Profile pictures: 2 MiB maximum.
  "profile-picture": 2 * 1024 * 1024,
  // Video submissions: 250 MiB maximum.
  "video-submission": 250 * 1024 * 1024,
} as const satisfies Record<MediaKind, number>;

export type MediaConfig = { bucket: string; region: string };

const uploadGrantTtlSeconds = 15 * 60;

const allowedContentTypes: Record<MediaKind, readonly string[]> = {
  "profile-picture": ["image/jpeg", "image/png", "image/webp"],
  "video-submission": ["video/mp4", "video/quicktime", "video/webm"],
};

/** Loads deployment-specific S3 settings. AWS credentials come from the SDK provider chain. */
export function readMediaConfig(values: {
  S3_MEDIA_BUCKET?: string;
  S3_MEDIA_REGION?: string;
}): MediaConfig {
  const bucket = values.S3_MEDIA_BUCKET?.trim();
  const region = values.S3_MEDIA_REGION?.trim();
  if (!bucket || !region) throw apiError("misconfigured");
  return { bucket, region };
}

/** Creates an S3 client only in a Node.js action, never in a Convex query or mutation. */
export function createMediaS3Client(config: MediaConfig): S3Client {
  return new S3Client({ region: config.region });
}

function requireAllowedContentType(kind: MediaKind, contentType: string): void {
  if (!allowedContentTypes[kind].includes(contentType)) {
    throw apiError("invalid_state", { reason: "unsupported_media_type" });
  }
}

function requireStagingKey(kind: MediaKind, key: string): void {
  if (!new RegExp(`^staging/${kind}/[0-9a-f-]+$`).test(key)) {
    throw apiError("not_found");
  }
}

function requirePermanentKey(kind: MediaKind, key: string): void {
  if (!new RegExp(`^media/${kind}/[0-9a-f-]+$`).test(key)) {
    throw apiError("not_found");
  }
}

/** Grants a browser upload to one unpredictable staging key, with exact type and size bounds. */
export async function createMediaUploadGrant(
  client: S3Client,
  config: MediaConfig,
  kind: MediaKind,
  contentType: string,
) {
  requireAllowedContentType(kind, contentType);
  const key = `staging/${kind}/${crypto.randomUUID()}`;
  const { url, fields } = await createPresignedPost(client, {
    Bucket: config.bucket,
    Key: key,
    Expires: uploadGrantTtlSeconds,
    Fields: { "Content-Type": contentType },
    Conditions: [{ "Content-Type": contentType }, ["content-length-range", 1, mediaLimits[kind]]],
  });
  return { key, url, fields, expiresAt: Date.now() + uploadGrantTtlSeconds * 1000 };
}

/** Confirms only S3 metadata; this does not prove that image/video bytes can be decoded. */
export async function inspectMediaObject(
  client: S3Client,
  config: MediaConfig,
  key: string,
  kind: MediaKind,
) {
  requireStagingKey(kind, key);
  const object = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
  const size = object.ContentLength;
  const contentType = object.ContentType;
  const etag = object.ETag;
  if (
    size === undefined ||
    size < 1 ||
    size > mediaLimits[kind] ||
    !contentType ||
    !allowedContentTypes[kind].includes(contentType) ||
    !etag
  ) {
    throw apiError("invalid_state", { reason: "invalid_media_object" });
  }
  return { key, contentType, size, etag };
}

/** Copies accepted bytes away from the still-valid upload grant's writable staging key. */
export async function promoteMediaObject(
  client: S3Client,
  config: MediaConfig,
  source: Awaited<ReturnType<typeof inspectMediaObject>>,
  kind: MediaKind,
  permanentKey: string,
) {
  requireStagingKey(kind, source.key);
  requirePermanentKey(kind, permanentKey);
  const copySource = `${encodeURIComponent(config.bucket)}/${source.key.split("/").map(encodeURIComponent).join("/")}`;
  const result = await client.send(
    new CopyObjectCommand({
      Bucket: config.bucket,
      Key: permanentKey,
      CopySource: copySource,
      CopySourceIfMatch: source.etag,
    }),
  );
  if (!result.CopyObjectResult?.ETag) throw apiError("upstream_failure");
  return permanentKey;
}
