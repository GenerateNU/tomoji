"use client";

import {
  RiAlertLine,
  RiCheckLine,
  RiCloseLine,
  RiTimeLine,
  RiUploadCloud2Line,
} from "@remixicon/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ProgressRing } from "@/components/progress-ring";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useMe } from "@/features/users/hooks/use-me";
import { errorMessage } from "@/lib/errors";
import { createMediaUpload, type MediaUploadPhase } from "@/lib/media-upload";
import { aiReviewStatusLabel } from "./assignment-status";

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const MAX_CAPTION_LENGTH = 25_000;
const MAX_NOTES_LENGTH = 5_000;

type DraftComposerProps = {
  assignmentId: Id<"assignments">;
  deliverableId: Id<"deliverables">;
  assignmentTitle: string;
  usesAiReview: boolean;
  reviewId?: Id<"submissions">;
  previous?: {
    caption?: string;
    draftDescription: string;
    mediaId?: Id<"mediaUploads">;
    reviewNote?: string;
  };
  onCancel: () => void;
  onSubmitted: (submissionId: Id<"submissions">) => void;
  onBusyChange: (busy: boolean) => void;
};

/** Sends the draft for review, reusing a completed upload when submitting is retried. */
export function DraftComposer({
  assignmentId,
  deliverableId,
  assignmentTitle,
  usesAiReview,
  previous,
  reviewId,
  onCancel,
  onSubmitted,
  onBusyChange,
}: DraftComposerProps) {
  const me = useMe();
  const creator = me?.synced ? [me.firstName, me.lastName].filter(Boolean).join(" ") : "You";
  const fileInput = useRef<HTMLInputElement>(null);
  const requestUpload = useAction(api.media.requestUpload);
  const completeUpload = useAction(api.media.completeUpload);
  const submit = useMutation(api.submissions.create);
  const review = useQuery(api.submissions.get, reviewId ? { submissionId: reviewId } : "skip");
  const reviewStage = review?.aiReview?.status;
  const reviewing =
    !review ||
    (review.status === "pending" &&
      !review.closedWithoutReview &&
      (reviewStage === "ready" || reviewStage === "transcribing" || reviewStage === "evaluating"));
  const captionId = useId();
  const notesId = useId();
  const [caption, setCaption] = useState(previous?.caption ?? "");
  const [notes, setNotes] = useState(previous?.draftDescription ?? "");
  const [keepPreviousVideo, setKeepPreviousVideo] = useState(Boolean(previous?.mediaId));
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [error, setError] = useState<string>();
  const [phase, setPhase] = useState<MediaUploadPhase | "submitting">();
  const upload = useRef<ReturnType<typeof createMediaUpload> | null>(null);
  const attempt = useRef<AbortController | null>(null);
  const readOnly = phase !== undefined || reviewId !== undefined;

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);
  useEffect(() => () => attempt.current?.abort(), []);

  function selectVideo(next?: File) {
    if (!next || readOnly || attempt.current) return;
    if (!VIDEO_TYPES.includes(next.type) || next.size === 0 || next.size > MAX_VIDEO_BYTES) {
      setError("Choose a nonempty MP4, MOV, or WebM video up to 250 MiB.");
      return;
    }
    setError(undefined);
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
    upload.current = createMediaUpload(
      next,
      { kind: "video-submission", assignmentId, timeoutMs: 5 * 60_000 },
      { requestUpload, completeUpload },
    );
  }

  async function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || attempt.current) return;
    const description = notes.trim();
    const text = caption.trim();
    const existingMedia = keepPreviousVideo ? previous?.mediaId : undefined;
    if (!description || (!text && !upload.current && !existingMedia)) {
      setError("Add draft notes and either a caption or a video.");
      return;
    }

    const controller = new AbortController();
    attempt.current = controller;
    onBusyChange(true);
    setError(undefined);
    setPhase("submitting");
    try {
      const mediaId = upload.current
        ? await upload.current.save(setPhase, controller.signal)
        : existingMedia;
      controller.signal.throwIfAborted();
      setPhase("submitting");
      const submissionId = await submit({
        assignmentId,
        deliverableId,
        draftDescription: description,
        caption: text || undefined,
        mediaId,
      });
      if (!controller.signal.aborted) onSubmitted(submissionId);
    } catch (error) {
      if (!controller.signal.aborted) {
        setError(
          errorMessage(error, {
            conflict: "A draft is already in review. Refresh to see its status.",
          }),
        );
      }
    } finally {
      attempt.current = null;
      if (!controller.signal.aborted) {
        setPhase(undefined);
        onBusyChange(false);
      }
    }
  }

  const submitLabel = {
    uploading: "Uploading video…",
    saving: "Finalizing upload…",
    submitting: "Submitting…",
  };

  return (
    <form onSubmit={submitDraft} className="grid md:grid-cols-2">
      <div className="space-y-5 p-5 md:p-8">
        <header className="space-y-2">
          <DialogTitle className="text-[24px] leading-tight">Submit assignment</DialogTitle>
          <DialogDescription>
            {usesAiReview
              ? "Our system will automatically review it."
              : "A reviewer will check your submission."}
          </DialogDescription>
          <p className="inline-block rounded-sm bg-gray-50 px-3 py-1 text-body-sm font-medium">
            {assignmentTitle}
          </p>
        </header>
        <div>
          <label htmlFor={captionId} className="mb-2 block text-body-sm text-gray-700">
            Caption
          </label>
          <Textarea
            id={captionId}
            value={caption}
            maxLength={MAX_CAPTION_LENGTH}
            disabled={readOnly}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Write the text you plan to post on X"
            className="min-h-[100px]"
          />
          <p className="mt-2 text-body-xs text-gray-500">
            {caption.length}/{MAX_CAPTION_LENGTH}
          </p>
        </div>
        <div
          className="space-y-2"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            selectVideo(event.dataTransfer.files[0]);
          }}
        >
          <p className="text-body-sm font-medium">Content</p>
          <input
            ref={fileInput}
            type="file"
            aria-label="Choose video file"
            accept={VIDEO_TYPES.join(",")}
            disabled={readOnly}
            hidden
            onChange={(event) => {
              selectVideo(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          {file && previewUrl ? (
            <div className="relative">
              <div className={readOnly ? "opacity-50" : undefined}>
                <VideoPreview url={previewUrl} label="Selected video" />
              </div>
              {!readOnly && (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-sm"
                  aria-label="Remove video"
                  className="absolute top-2 right-2"
                  onClick={() => {
                    setFile(null);
                    setPreviewUrl(undefined);
                    upload.current = null;
                  }}
                >
                  <RiCloseLine aria-hidden />
                </Button>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled={readOnly}
              onClick={() => fileInput.current?.click()}
              className="flex min-h-28 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 p-4 hover:bg-gray-25"
            >
              <RiUploadCloud2Line size={22} aria-hidden />
              <span className="text-body-sm font-medium">Choose or drop a video</span>
              <span className="text-body-xs text-gray-500">MP4, MOV, or WebM up to 250 MiB</span>
            </button>
          )}
          {!file && previous?.mediaId && (
            <label className="flex items-center gap-2 text-body-sm">
              <input
                type="checkbox"
                checked={keepPreviousVideo}
                disabled={readOnly}
                onChange={(event) => setKeepPreviousVideo(event.target.checked)}
              />
              Reuse the previous video
            </label>
          )}
        </div>
        <div>
          <label htmlFor={notesId} className="mb-2 block text-body-sm text-gray-700">
            Draft notes
          </label>
          <Textarea
            id={notesId}
            value={notes}
            maxLength={MAX_NOTES_LENGTH}
            disabled={readOnly}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Tell the reviewer what you’re submitting"
            required
            className="min-h-14"
          />
        </div>
        {error && (
          <p role="alert" className="text-body-sm text-red-700">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Button type="button" variant="secondary-subtle" onClick={onCancel} disabled={!!phase}>
            {reviewId ? "Back to assignment" : "Cancel"}
          </Button>
          {reviewId ? (
            <Button type="button" disabled>
              {reviewing ? "Reviewing…" : "Submitted"}
            </Button>
          ) : (
            <Button type="submit" disabled={!!phase}>
              {phase ? submitLabel[phase] : "Submit for review"}
            </Button>
          )}
        </div>
      </div>
      <aside className="space-y-6 bg-gray-50 p-5 md:p-8" aria-label="Post preview">
        <div className="space-y-4 rounded-xl bg-gray-0 p-5">
          <div className="flex items-center gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-full bg-indigo-100 text-indigo-700"
              aria-hidden
            >
              {creator[0]}
            </span>
            <p className="text-body-sm font-medium">{creator}</p>
          </div>
          {caption.trim() && (
            <p className="text-body-sm break-words whitespace-pre-wrap">{caption}</p>
          )}
          {previewUrl && <VideoPreview url={previewUrl} label="Draft video preview" />}
          {!caption.trim() && !file && (
            <p className="text-body-sm text-gray-500">Your caption and video will appear here.</p>
          )}
        </div>
        {reviewId ? (
          <DraftReviewProgress
            review={review}
            reviewing={reviewing}
            hasVideo={Boolean(file || (keepPreviousVideo && previous?.mediaId))}
          />
        ) : (
          <p className="text-center text-body-xs text-gray-500">Preview</p>
        )}
        {!reviewId && previous?.reviewNote && (
          <div className="space-y-3 rounded-xl bg-gray-0 p-5 text-body-sm">
            <div className="flex items-center gap-2 font-medium">
              <RiAlertLine size={20} className="text-red-700" aria-hidden />
              <h3>Changes needed</h3>
            </div>
            <p className="border-t pt-3 break-words whitespace-pre-wrap text-gray-700">
              {previous.reviewNote}
            </p>
          </div>
        )}
      </aside>
    </form>
  );
}

type SubmittedDraft = FunctionReturnType<typeof api.submissions.get>;

/** Displays the reported review stage beneath the preview of the submitted draft. */
function DraftReviewProgress({
  review,
  reviewing,
  hasVideo,
}: {
  review: SubmittedDraft | undefined;
  reviewing: boolean;
  hasVideo: boolean;
}) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => card.current?.focus(), []);

  const status = review?.aiReview?.status;
  const steps = (review ? review.mediaId !== undefined : hasVideo) ? 3 : 2;
  const step = status === "evaluating" ? steps : status === "transcribing" ? 2 : 1;
  const text = reviewing
    ? aiReviewStatusLabel[status ?? "ready"]
    : review?.status === "approved"
      ? "Draft approved"
      : review?.status === "changesRequested"
        ? "Changes needed"
        : review?.closedWithoutReview
          ? "Closed without review"
          : aiReviewStatusLabel.manualReview;
  const Icon =
    review?.status === "approved"
      ? RiCheckLine
      : review?.status === "changesRequested"
        ? RiAlertLine
        : RiTimeLine;

  return (
    <div ref={card} tabIndex={-1} className="flex items-center gap-4 rounded-xl bg-gray-0 p-5">
      {reviewing ? (
        <ProgressRing
          value={((step - 1) / steps) * 100}
          label="AI review progress"
          aria-valuetext={`Step ${step} of ${steps}`}
        />
      ) : (
        <Icon size={24} className="shrink-0 text-gray-700" aria-hidden />
      )}
      <div role="status" className="min-w-0 space-y-0.5">
        <p className="font-medium">{text}</p>
        {reviewing && (
          <p className="text-body-sm text-gray-500">
            Step {step} of {steps}
          </p>
        )}
        {review && review.status !== "pending" && review.reviewNote && (
          <p className="text-body-sm break-words whitespace-pre-wrap text-gray-700">
            {review.reviewNote}
          </p>
        )}
      </div>
    </div>
  );
}

/** Uses the selected file locally before its upload completes. */
function VideoPreview({ url, label }: { url: string; label: string }) {
  return (
    <video
      aria-label={label}
      src={url}
      controls
      playsInline
      className="aspect-video max-h-[320px] w-full rounded-md bg-gray-950"
    />
  );
}
