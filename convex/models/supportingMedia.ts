import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import type { MediaKind } from "../schemas/mediaUploads.schema";

/** Reference files one deliverable can carry. Multiplied by MAX_DELIVERABLES per brief. */
export const MAX_DELIVERABLE_EXAMPLES = 5;

/** Files one dispute can carry. Read one dispute at a time, so a looser cap is affordable. */
export const MAX_DISPUTE_EVIDENCE = 10;

/**
 * Checks files a row is about to reference: each one exists, finished
 * uploading, is of the expected kind, and belongs to the caller. Returns the
 * IDs deduplicated in the caller's order.
 *
 * Unlike profile pictures these never attach themselves on completion, so this
 * is the only point that binds an upload to the row that uses it.
 */
export async function requireSupportingMedia(
  ctx: QueryCtx | MutationCtx,
  ownerUserId: Id<"users">,
  kind: MediaKind,
  mediaIds: Id<"mediaUploads">[],
  max: number,
): Promise<Id<"mediaUploads">[]> {
  const unique = [...new Set(mediaIds)];
  if (unique.length > max) {
    throw apiError("invalid_state", { reason: "too_many_files", kind, max });
  }
  for (const mediaId of unique) {
    const upload: Doc<"mediaUploads"> | null = await ctx.db.get("mediaUploads", mediaId);
    if (upload === null || upload.kind !== kind || upload.ownerUserId !== ownerUserId) {
      throw apiError("not_found", { resource: "media" });
    }
    if (upload.status !== "complete") {
      throw apiError("invalid_state", { reason: "upload_not_complete" });
    }
  }
  return unique;
}
