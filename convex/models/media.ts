import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { uploadCompletionGracePeriodMs } from "../lib/mediaUploadPolicy";
import { mediaKind } from "../schemas/mediaUploads.schema";
import { companyContext } from "../lib/functions";
import { requireCallerCreatorId } from "./users";

export type MediaKind = Infer<typeof mediaKind>;

export type NewMediaUpload = {
  kind: MediaKind;
  assignmentId?: Id<"assignments">;
  stagingKey: string;
  contentType: string;
  grantExpiresAt: number;
};

export type VerifiedMediaUpload = {
  stagingKey: string;
  permanentKey: string;
  contentType: string;
  sizeBytes: number;
};

/** Checks the owner and target before a grant is issued or a staged upload is accepted. */
export async function authorizeMediaUpload(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  kind: MediaKind,
  assignmentId?: Id<"assignments">,
): Promise<void> {
  if (kind === "profile-picture") {
    if (assignmentId !== undefined)
      throw apiError("invalid_state", { reason: "unexpected_assignment" });
    return;
  }

  if (assignmentId === undefined)
    throw apiError("invalid_state", { reason: "assignment_required" });
  if (user.role !== "creator") throw apiError("forbidden", { requiredRole: "creator" });

  const creatorId = await requireCallerCreatorId(ctx, user);
  const assignment = await ctx.db.get("assignments", assignmentId);
  if (assignment === null || assignment.creatorId !== creatorId) {
    throw apiError("not_found", { resource: "assignment" });
  }
  if (assignment.status !== "active") {
    throw apiError("invalid_state", { reason: "assignment_not_active" });
  }
}

/** Records the server-issued grant only after its target has been authorized. */
export async function reserveMediaUpload(
  ctx: MutationCtx,
  user: Doc<"users">,
  upload: NewMediaUpload,
): Promise<Id<"mediaUploads">> {
  await authorizeMediaUpload(ctx, user, upload.kind, upload.assignmentId);
  return await ctx.db.insert("mediaUploads", {
    ownerUserId: user._id,
    kind: upload.kind,
    assignmentId: upload.assignmentId,
    stagingKey: upload.stagingKey,
    contentType: upload.contentType,
    grantExpiresAt: upload.grantExpiresAt,
    status: "pending",
  });
}

/** Hides both missing and other users' grants behind the same error. */
export async function requireOwnedMediaUpload(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  uploadId: Id<"mediaUploads">,
): Promise<Doc<"mediaUploads">> {
  const upload = await ctx.db.get("mediaUploads", uploadId);
  if (upload === null || upload.ownerUserId !== user._id) {
    throw apiError("not_found", { resource: "mediaUpload" });
  }
  return upload;
}

/** Commits the immutable S3 copy; repeated completion returns the winning copy. */
export async function finalizeMediaUpload(
  ctx: MutationCtx,
  user: Doc<"users">,
  uploadId: Id<"mediaUploads">,
  verified: VerifiedMediaUpload,
): Promise<{ permanentKey: string; adopted: boolean }> {
  const upload = await requireOwnedMediaUpload(ctx, user, uploadId);
  if (upload.status === "complete") {
    if (upload.permanentKey === undefined) throw apiError("misconfigured");
    return { permanentKey: upload.permanentKey, adopted: false };
  }
  if (Date.now() > upload.grantExpiresAt + uploadCompletionGracePeriodMs) {
    throw apiError("invalid_state", { reason: "upload_expired" });
  }
  await authorizeMediaUpload(ctx, user, upload.kind, upload.assignmentId);
  if (verified.stagingKey !== upload.stagingKey || verified.contentType !== upload.contentType) {
    throw apiError("invalid_state", { reason: "upload_mismatch" });
  }
  await ctx.db.patch("mediaUploads", uploadId, {
    status: "complete",
    permanentKey: verified.permanentKey,
    sizeBytes: verified.sizeBytes,
  });
  if (upload.kind === "profile-picture") {
    await ctx.db.patch("users", user._id, { profilePictureMediaId: uploadId });
  }
  return { permanentKey: verified.permanentKey, adopted: true };
}

/** Returns only the current private profile picture of an active user. */
export async function requireReadableProfilePicture(
  ctx: QueryCtx,
  mediaId: Id<"mediaUploads">,
): Promise<Doc<"mediaUploads">> {
  const upload = await ctx.db.get("mediaUploads", mediaId);
  if (upload?.kind !== "profile-picture" || upload.status !== "complete") {
    throw apiError("not_found", { resource: "profilePicture" });
  }
  const owner = await ctx.db.get("users", upload.ownerUserId);
  if (owner === null || !owner.isActive || owner.profilePictureMediaId !== mediaId) {
    throw apiError("not_found", { resource: "profilePicture" });
  }
  return upload;
}

/** Restricts a private video to its creator, its company, or an operator. */
export async function requireReadableVideo(
  ctx: QueryCtx,
  viewer: Doc<"users">,
  mediaId: Id<"mediaUploads">,
): Promise<Doc<"mediaUploads">> {
  const upload = await ctx.db.get("mediaUploads", mediaId);
  if (upload?.kind !== "video-submission" || upload.status !== "complete") {
    throw apiError("not_found", { resource: "video" });
  }
  if (viewer.role === "operator" || viewer._id === upload.ownerUserId) return upload;
  if (viewer.role === "company" && upload.assignmentId !== undefined) {
    const { membership } = await companyContext(ctx);
    const assignment = await ctx.db.get("assignments", upload.assignmentId);
    if (assignment !== null && assignment.companyId === membership.companyId) return upload;
  }
  throw apiError("not_found", { resource: "video" });
}
