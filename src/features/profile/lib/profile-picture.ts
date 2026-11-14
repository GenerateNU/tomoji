import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export const profilePictureTypes = ["image/jpeg", "image/png", "image/webp"];

export function validateProfilePicture(file: Pick<File, "type" | "size">): string | null {
  if (!profilePictureTypes.includes(file.type)) return "Choose a JPEG, PNG, or WebP image.";
  if (file.size === 0) return "This file is empty. Choose another picture.";
  if (file.size > 2 * 1024 * 1024) return "Choose a picture smaller than 2 MB.";
  return null;
}

type UploadActions = {
  requestUpload: (
    args: FunctionArgs<typeof api.media.requestUpload>,
  ) => Promise<FunctionReturnType<typeof api.media.requestUpload>>;
  completeUpload: (
    args: FunctionArgs<typeof api.media.completeUpload>,
  ) => Promise<FunctionReturnType<typeof api.media.completeUpload>>;
};
export type PictureUploadPhase = "uploading" | "saving";

/** Keeps the completed S3 transfer so a lost completion response can safely be retried. */
export function createProfilePictureUpload(
  file: File,
  actions: UploadActions,
  post: typeof fetch = fetch,
) {
  let grant: FunctionReturnType<typeof api.media.requestUpload> | undefined;
  let transferred = false;
  let inFlight: Promise<Id<"mediaUploads">> | undefined;

  async function transfer(onPhase?: (phase: PictureUploadPhase) => void, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const invalid = validateProfilePicture(file);
    if (invalid) throw new Error(invalid);
    if (!transferred) {
      onPhase?.("uploading");
      if (!grant || grant.expiresAt <= Date.now()) {
        grant = await actions.requestUpload({ kind: "profile-picture", contentType: file.type });
      }
      signal?.throwIfAborted();
      const body = new FormData();
      for (const [name, value] of Object.entries(grant.fields)) body.append(name, value);
      body.append("file", file);
      const timeout = AbortSignal.timeout(60_000);
      const response = await post(grant.url, {
        method: "POST",
        body,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw new Error("Picture upload failed.");
      transferred = true;
    }
    signal?.throwIfAborted();
    onPhase?.("saving");
    const completed = await actions.completeUpload({ uploadId: grant!.uploadId });
    return completed.mediaId;
  }

  return {
    save(onPhase?: (phase: PictureUploadPhase) => void, signal?: AbortSignal) {
      inFlight ??= transfer(onPhase, signal).finally(() => {
        inFlight = undefined;
      });
      return inFlight;
    },
  };
}
