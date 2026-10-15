import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { apiError } from "./lib/errors";
import {
  authorizeMediaUpload,
  finalizeMediaUpload,
  requireOwnedMediaUpload,
  requireReadableProfilePicture,
  requireReadableVideo,
  reserveMediaUpload,
} from "./models/media";
import { requireUser } from "./models/users";
import schema from "./schema";
import { mediaKind } from "./schemas/mediaUploads.schema";

/** Checks the target before an action asks S3 to sign a browser upload. */
export const authorizeUpload = internalQuery({
  args: { kind: mediaKind, assignmentId: v.optional(v.id("assignments")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    await authorizeMediaUpload(ctx, user, args.kind, args.assignmentId);
    return null;
  },
});

/** Binds the signed staging key to the same authenticated caller and target. */
export const reserveUpload = internalMutation({
  args: {
    kind: mediaKind,
    assignmentId: v.optional(v.id("assignments")),
    stagingKey: v.string(),
    contentType: v.string(),
    grantExpiresAt: v.number(),
  },
  returns: v.id("mediaUploads"),
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    return await reserveMediaUpload(ctx, user, args);
  },
});

/** Prevents another caller from completing or inspecting an upload ID. */
export const getOwnedUpload = internalQuery({
  args: { uploadId: v.id("mediaUploads") },
  returns: schema.doc("mediaUploads"),
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    return await requireOwnedMediaUpload(ctx, user, args.uploadId);
  },
});

/** Atomically adopts one verified copy and attaches profile pictures to their owner. */
export const finishUpload = internalMutation({
  args: {
    uploadId: v.id("mediaUploads"),
    stagingKey: v.string(),
    permanentKey: v.string(),
    contentType: v.string(),
    sizeBytes: v.number(),
  },
  returns: v.object({ permanentKey: v.string(), adopted: v.boolean() }),
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    return await finalizeMediaUpload(ctx, user, args.uploadId, args);
  },
});

/** Only current pictures are exposed to authenticated readers. */
export const getProfilePicture = internalQuery({
  args: { mediaId: v.id("mediaUploads") },
  returns: v.object({ key: v.string(), contentType: v.string() }),
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const upload = await requireReadableProfilePicture(ctx, args.mediaId);
    if (upload.permanentKey === undefined) throw apiError("misconfigured");
    return { key: upload.permanentKey, contentType: upload.contentType };
  },
});

/** Resolves a video only after checking creator/company/operator visibility. */
export const getVideo = internalQuery({
  args: { mediaId: v.id("mediaUploads") },
  returns: v.object({ key: v.string() }),
  handler: async (ctx, args) => {
    const { user } = await requireUser(ctx);
    const upload = await requireReadableVideo(ctx, user, args.mediaId);
    if (upload.permanentKey === undefined) throw apiError("misconfigured");
    return { key: upload.permanentKey };
  },
});
