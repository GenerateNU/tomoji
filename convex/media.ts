"use node";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action, env } from "./_generated/server";
import { requireIdentity } from "./lib/authz";
import { apiError } from "./lib/errors";
import { uploadCompletionGracePeriodMs } from "./lib/mediaUploadPolicy";
import {
  createMediaS3Client,
  createMediaUploadGrant,
  inspectMediaObject,
  mediaLimits,
  promoteMediaObject,
  readMediaConfig,
  type MediaKind,
} from "./lib/s3";
import { mediaKind } from "./schemas/mediaUploads.schema";

const videoReadTtlSeconds = 5 * 60;

/** Issues a 15-minute direct-to-S3 grant for the caller's picture or active assignment. */
export const requestUpload = action({
  args: {
    kind: mediaKind,
    contentType: v.string(),
    assignmentId: v.optional(v.id("assignments")),
  },
  returns: v.object({
    uploadId: v.id("mediaUploads"),
    url: v.string(),
    fields: v.record(v.string(), v.string()),
    expiresAt: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    uploadId: Id<"mediaUploads">;
    url: string;
    fields: Record<string, string>;
    expiresAt: number;
  }> => {
    await requireIdentity(ctx);
    await ctx.runQuery(internal.mediaInternal.authorizeUpload, {
      kind: args.kind,
      assignmentId: args.assignmentId,
    });

    const config = readMediaConfig(env);
    const grant = await createMediaUploadGrant(
      createMediaS3Client(config),
      config,
      args.kind,
      args.contentType,
    );
    const uploadId = await ctx.runMutation(internal.mediaInternal.reserveUpload, {
      kind: args.kind,
      assignmentId: args.assignmentId,
      stagingKey: grant.key,
      contentType: args.contentType,
      grantExpiresAt: grant.expiresAt,
    });
    return { uploadId, url: grant.url, fields: grant.fields, expiresAt: grant.expiresAt };
  },
});

/** Verifies S3 metadata, copies the bytes to a server-owned key, and records the media ID. */
export const completeUpload = action({
  args: { uploadId: v.id("mediaUploads") },
  returns: v.object({ mediaId: v.id("mediaUploads"), kind: mediaKind }),
  handler: async (ctx, args): Promise<{ mediaId: Id<"mediaUploads">; kind: MediaKind }> => {
    await requireIdentity(ctx);
    const upload = await ctx.runQuery(internal.mediaInternal.getOwnedUpload, args);
    if (upload.status === "complete") return { mediaId: upload._id, kind: upload.kind };
    if (Date.now() > upload.grantExpiresAt + uploadCompletionGracePeriodMs) {
      throw apiError("invalid_state", { reason: "upload_expired" });
    }

    const config = readMediaConfig(env);
    const client = createMediaS3Client(config);
    const verified = await inspectMediaObject(client, config, upload.stagingKey, upload.kind);
    if (verified.contentType !== upload.contentType) {
      throw apiError("invalid_state", { reason: "upload_mismatch" });
    }
    // Each attempt gets a unique destination: concurrent completions cannot overwrite the winner.
    const permanentKey = `media/${upload.kind}/${crypto.randomUUID()}`;
    try {
      await promoteMediaObject(client, config, verified, upload.kind, permanentKey);
    } catch (error) {
      if (error instanceof ConvexError) throw error;
      const status = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
        ?.httpStatusCode;
      if (status === 412) throw apiError("invalid_state", { reason: "upload_mismatch" });
      throw apiError("upstream_failure");
    }
    try {
      const finished = await ctx.runMutation(internal.mediaInternal.finishUpload, {
        uploadId: upload._id,
        stagingKey: verified.key,
        permanentKey,
        contentType: verified.contentType,
        sizeBytes: verified.size,
      });
      if (!finished.adopted) await removeUnusedCopy(client, config.bucket, permanentKey);
    } catch (error) {
      await removeUnusedCopy(client, config.bucket, permanentKey);
      throw error;
    }
    return { mediaId: upload._id, kind: upload.kind };
  },
});

/** Sends a current private picture through Convex; S3 never grants the browser GET access. */
export const getProfilePicture = action({
  args: { mediaId: v.id("mediaUploads") },
  returns: v.object({ contentType: v.string(), bytes: v.bytes() }),
  handler: async (ctx, args): Promise<{ contentType: string; bytes: ArrayBuffer }> => {
    await requireIdentity(ctx);
    const picture = await ctx.runQuery(internal.mediaInternal.getProfilePicture, args);
    const config = readMediaConfig(env);
    let object: GetObjectCommandOutput;
    try {
      object = await createMediaS3Client(config).send(
        new GetObjectCommand({ Bucket: config.bucket, Key: picture.key }),
      );
    } catch {
      throw apiError("upstream_failure");
    }
    if (
      object.ContentLength === undefined ||
      object.ContentLength < 1 ||
      object.ContentLength > mediaLimits["profile-picture"] ||
      object.ContentType !== picture.contentType ||
      object.Body === undefined
    ) {
      throw apiError("invalid_state", { reason: "invalid_media_object" });
    }
    let bytes: Uint8Array;
    try {
      bytes = await object.Body.transformToByteArray();
    } catch {
      throw apiError("upstream_failure");
    }
    if (bytes.length < 1 || bytes.length > mediaLimits["profile-picture"]) {
      throw apiError("invalid_state", { reason: "invalid_media_object" });
    }
    return { contentType: picture.contentType, bytes: Uint8Array.from(bytes).buffer };
  },
});

/** Returns a short-lived video URL only to the creator, company, or operator. */
export const getVideoUrl = action({
  args: { mediaId: v.id("mediaUploads") },
  returns: v.object({ url: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args): Promise<{ url: string; expiresAt: number }> => {
    await requireIdentity(ctx);
    const video = await ctx.runQuery(internal.mediaInternal.getVideo, args);
    const config = readMediaConfig(env);
    const url = await getSignedUrl(
      createMediaS3Client(config),
      new GetObjectCommand({ Bucket: config.bucket, Key: video.key }),
      { expiresIn: videoReadTtlSeconds },
    );
    return { url, expiresAt: Date.now() + videoReadTtlSeconds * 1000 };
  },
});

/** Removes only this failed attempt's unique, unreferenced permanent copy. */
async function removeUnusedCopy(client: S3Client, bucket: string, key: string): Promise<void> {
  try {
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch {
    // Cleanup failure must not mask the result; operations should monitor leftover media/ objects.
    console.error("Could not remove unreferenced media object", { key });
  }
}
