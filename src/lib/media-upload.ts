import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

export type UploadActions = {
  requestUpload: (
    args: FunctionArgs<typeof api.media.requestUpload>,
  ) => Promise<FunctionReturnType<typeof api.media.requestUpload>>;
  completeUpload: (
    args: FunctionArgs<typeof api.media.completeUpload>,
  ) => Promise<FunctionReturnType<typeof api.media.completeUpload>>;
};
export type MediaUploadPhase = "uploading" | "saving";

/** Keeps the completed S3 transfer so a lost completion response can safely be retried. */
export function createMediaUpload(
  file: File,
  options: Pick<FunctionArgs<typeof api.media.requestUpload>, "kind" | "assignmentId"> & {
    timeoutMs: number;
  },
  actions: UploadActions,
  post: typeof fetch = fetch,
) {
  let grant: FunctionReturnType<typeof api.media.requestUpload> | undefined;
  let transferred = false;
  let inFlight: Promise<Id<"mediaUploads">> | undefined;

  async function transfer(onPhase?: (phase: MediaUploadPhase) => void, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (!transferred) {
      onPhase?.("uploading");
      if (!grant || grant.expiresAt <= Date.now()) {
        const { kind, assignmentId } = options;
        const fields = { kind, contentType: file.type };
        grant = await actions.requestUpload(
          assignmentId === undefined ? fields : { ...fields, assignmentId },
        );
      }
      signal?.throwIfAborted();
      const body = new FormData();
      for (const [name, value] of Object.entries(grant.fields)) body.append(name, value);
      body.append("file", file);
      const timeout = AbortSignal.timeout(options.timeoutMs);
      const response = await post(grant.url, {
        method: "POST",
        body,
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      if (!response.ok) throw new Error(kindFailureMessage(options.kind));
      transferred = true;
    }
    signal?.throwIfAborted();
    onPhase?.("saving");
    const completed = await actions.completeUpload({ uploadId: grant!.uploadId });
    return completed.mediaId;
  }

  return {
    save(onPhase?: (phase: MediaUploadPhase) => void, signal?: AbortSignal) {
      inFlight ??= transfer(onPhase, signal).finally(() => {
        inFlight = undefined;
      });
      return inFlight;
    },
  };
}

/** Chooses the same upload failure copy across retries. */
function kindFailureMessage(kind: FunctionArgs<typeof api.media.requestUpload>["kind"]) {
  return kind === "profile-picture" ? "Picture upload failed." : "File upload failed.";
}
