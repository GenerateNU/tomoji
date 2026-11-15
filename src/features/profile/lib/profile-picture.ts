import { createMediaUpload, type UploadActions, type MediaUploadPhase } from "@/lib/media-upload";

export const profilePictureTypes = ["image/jpeg", "image/png", "image/webp"];

export function validateProfilePicture(file: Pick<File, "type" | "size">): string | null {
  if (!profilePictureTypes.includes(file.type)) return "Choose a JPEG, PNG, or WebP image.";
  if (file.size === 0) return "This file is empty. Choose another picture.";
  if (file.size > 2 * 1024 * 1024) return "Choose a picture smaller than 2 MB.";
  return null;
}

export type PictureUploadPhase = MediaUploadPhase;

/** Creates a retryable upload for this profile picture. */
export function createProfilePictureUpload(
  file: File,
  actions: UploadActions,
  post: typeof fetch = fetch,
) {
  const upload = createMediaUpload(
    file,
    { kind: "profile-picture", timeoutMs: 60_000 },
    actions,
    post,
  );
  return {
    async save(onPhase?: (phase: PictureUploadPhase) => void, signal?: AbortSignal) {
      const invalid = validateProfilePicture(file);
      if (invalid) throw new Error(invalid);
      return await upload.save(onPhase, signal);
    },
  };
}
