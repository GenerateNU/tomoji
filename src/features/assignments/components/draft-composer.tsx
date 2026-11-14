"use client";

import {
  RiAlertLine,
  RiCheckLine,
  RiCloseLine,
  RiTimeLine,
  RiExternalLinkLine,
  RiPlayMiniLine,
} from "@remixicon/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation, useQueries, useQuery, type RequestForQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { ProgressRing } from "@/components/progress-ring";
import { Button } from "@/components/ui/button";
import { DialogClose, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";
import { createMediaUpload, type MediaUploadPhase } from "@/lib/media-upload";
import { aiReviewStatusLabel } from "./assignment-status";
import { SubmissionPreview } from "./submission-preview";
import { SubmittedVideo } from "./submitted-video";
import { VideoPreview } from "./video-preview";

const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const MAX_CAPTION_LENGTH = 25_000;
const MAX_NOTES_LENGTH = 5_000;

type DraftComposerProps = {
  assignmentId: Id<"assignments">;
  opportunityId: Id<"opportunities">;
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
  onRevise: (id: Id<"submissions">) => void;
  onSubmitted: (submissionId: Id<"submissions">) => void;
  onBusyChange: (busy: boolean) => void;
};

/** Sends the draft for review, reusing a completed upload when submitting is retried. */
export function DraftComposer({
  assignmentId,
  opportunityId,
  deliverableId,
  assignmentTitle,
  usesAiReview,
  previous,
  reviewId,
  onCancel,
  onRevise,
  onSubmitted,
  onBusyChange,
}: DraftComposerProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const requestUpload = useAction(api.media.requestUpload);
  const completeUpload = useAction(api.media.completeUpload);
  const submit = useMutation(api.submissions.create);
  const review = useQuery(api.submissions.get, reviewId ? { submissionId: reviewId } : "skip");
  const criteriaQuery = useMemo(
    (): RequestForQueries =>
      usesAiReview
        ? { deliverables: { query: api.deliverables.list, args: { opportunityId } } }
        : {},
    [usesAiReview, opportunityId],
  );
  const {
    deliverables,
  }: { deliverables?: FunctionReturnType<typeof api.deliverables.list> | Error } =
    useQueries(criteriaQuery);
  const criteria = Array.isArray(deliverables)
    ? deliverables.find(({ _id }) => _id === deliverableId)?.reviewCriteria
    : undefined;
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
  const readOnly = phase !== undefined;

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

  const previousMediaId = keepPreviousVideo ? previous?.mediaId : undefined;
  const preview = (
    <SubmissionPreview caption={caption} placeholder={!reviewId}>
      {previewUrl ? (
        <VideoPreview key={previewUrl} url={previewUrl} label="Draft video preview" />
      ) : previousMediaId ? (
        <SubmittedVideo mediaId={previousMediaId} eager />
      ) : null}
    </SubmissionPreview>
  );

  if (reviewId) {
    return (
      <div className="grid min-w-0 min-h-[min(79.4dvh,780px)] place-items-center bg-gray-50 px-5 py-16">
        <DialogTitle className="sr-only">Submission review</DialogTitle>
        <DialogDescription className="sr-only">Your draft and its review status</DialogDescription>
        <DialogClose
          aria-label="Close"
          className="absolute top-6 right-6 grid size-8 place-items-center rounded-sm text-gray-500 hover:bg-gray-100"
        >
          <RiCloseLine size={16} aria-hidden />
        </DialogClose>
        <div className="w-full max-w-[446px] space-y-5">
          {preview}
          <DraftReviewProgress
            key={reviewId}
            review={review}
            reviewing={reviewing}
            criteria={criteria}
          />
          {!reviewing && review?.status === "changesRequested" && (
            <Button type="button" size="sm" className="w-full" onClick={() => onRevise(reviewId)}>
              Resubmit
            </Button>
          )}
          {!reviewing && (
            <Button
              type="button"
              size="sm"
              variant="secondary-ghost"
              className="w-full"
              onClick={onCancel}
            >
              {review?.status === "changesRequested" ? "Not now" : "Back to assignment"}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submitDraft}
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] min-h-[min(79.4dvh,780px)] md:grid-cols-[46.25%_minmax(0,1fr)]"
    >
      <div className="relative flex min-w-0 flex-col gap-6 p-5 md:p-8">
        <DialogClose
          aria-label="Close"
          disabled={readOnly}
          className="absolute top-6 right-6 grid size-8 place-items-center rounded-sm text-gray-500 hover:bg-gray-50 disabled:opacity-40"
        >
          <RiCloseLine size={16} aria-hidden />
        </DialogClose>
        <header className="space-y-4 pr-7">
          <DialogTitle className="text-[28px] leading-tight">Submit assignment</DialogTitle>
          <DialogDescription>
            {usesAiReview
              ? "Our system will automatically review it."
              : "A reviewer will check your submission."}
          </DialogDescription>
          <p className="flex min-w-0 items-center gap-2 rounded-sm bg-gray-50 px-3 py-1.5 text-body-sm font-medium">
            <RiExternalLinkLine aria-hidden className="size-4 shrink-0" />
            <span className="truncate" title={assignmentTitle}>
              {assignmentTitle}
            </span>
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
            placeholder="What’s happening?"
            className="min-h-[100px]"
          />
          <p className="mt-2 text-right text-body-xs text-gray-500">
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
          <p className="text-body-sm text-gray-700">Content</p>
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
                <VideoPreview key={previewUrl} url={previewUrl} label="Selected video" />
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
              className="flex min-h-42 w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-gray-300 p-4 hover:bg-gray-25"
            >
              <span
                aria-hidden
                className="mb-3 grid h-20 w-31 -rotate-5 place-items-center rounded-lg bg-gray-50 shadow"
              >
                <RiPlayMiniLine size={22} />
              </span>
              <span className="text-body-sm font-medium">Upload a video or drag it here</span>
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
        <div className="mt-auto flex flex-wrap justify-end gap-2.5">
          <Button type="button" variant="secondary-subtle" onClick={onCancel} disabled={readOnly}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={
              readOnly ||
              !notes.trim() ||
              !(caption.trim() || file || (keepPreviousVideo && previous?.mediaId))
            }
          >
            {phase ? submitLabel[phase] : "Submit for review"}
          </Button>
        </div>
      </div>
      <aside
        className="min-w-0 space-y-6 bg-gray-50 p-5 md:px-10 md:py-8"
        aria-label="Post preview"
      >
        <p className="text-center text-body-sm text-gray-500">Preview</p>
        {preview}
        {previous?.reviewNote && (
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
type ReviewCriteria = NonNullable<
  FunctionReturnType<typeof api.deliverables.list>[number]["reviewCriteria"]
>;
const REVIEW_TICK_MS = 1_000;
const TICKS_PER_CRITERION = 2;
const INITIAL_REVIEW_PROGRESS = 16;
const MAX_REVIEW_PROGRESS = 88;
const REVIEW_PROGRESS_PER_TICK = 8;

/** Cycles through the brief's criteria while the server evaluates the draft. */
function ReviewingCriteria({ criteria }: { criteria?: ReviewCriteria }) {
  const [ticks, setTicks] = useState(0);
  const criterionCount = criteria?.length ?? 0;
  const progressTicks = (MAX_REVIEW_PROGRESS - INITIAL_REVIEW_PROGRESS) / REVIEW_PROGRESS_PER_TICK;
  const lastTick = Math.max(progressTicks, criterionCount * TICKS_PER_CRITERION);

  useEffect(() => {
    if (ticks >= lastTick) return;
    const timer = window.setTimeout(() => setTicks(ticks + 1), REVIEW_TICK_MS);
    return () => window.clearTimeout(timer);
  }, [ticks, lastTick]);

  // The backend reports the evaluation stage, so the ring represents waiting time.
  const progress = Math.min(
    MAX_REVIEW_PROGRESS,
    INITIAL_REVIEW_PROGRESS + ticks * REVIEW_PROGRESS_PER_TICK,
  );
  const criterion = criteria?.[Math.floor(ticks / TICKS_PER_CRITERION)];
  return (
    <div className="flex items-center gap-4">
      <ProgressRing
        size="md"
        value={progress}
        label="Reviewing submission"
        aria-valuenow={undefined}
      />
      <div className="min-w-0">
        <p className="text-body font-medium">Reviewing submission</p>
        {criterion && (
          <p className="max-h-20 overflow-y-auto text-body-sm wrap-anywhere text-gray-700">
            {criterion.description}
          </p>
        )}
      </div>
    </div>
  );
}

/** Displays the reported review stage beneath the preview of the submitted draft. */
function DraftReviewProgress({
  review,
  reviewing,
  criteria,
}: {
  review: SubmittedDraft | undefined;
  reviewing: boolean;
  criteria?: ReviewCriteria;
}) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => card.current?.focus(), []);

  const status = review?.aiReview?.status;
  const text = reviewing
    ? aiReviewStatusLabel[status ?? "ready"]
    : review?.status === "approved"
      ? "Draft approved"
      : review?.status === "changesRequested"
        ? "Your submission has been rejected. Review the reasons below and resubmit after adjusting."
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
    <div ref={card} tabIndex={-1} className="rounded-lg bg-gray-0 p-4">
      {reviewing ? (
        status === "evaluating" ? (
          <ReviewingCriteria criteria={criteria} />
        ) : (
          <div className="flex items-center gap-4">
            <ProgressRing
              size="md"
              value={status === "transcribing" ? INITIAL_REVIEW_PROGRESS : 0}
              showLabel={false}
              label={text}
              aria-valuenow={undefined}
            />
            <p className="text-body font-medium">{text}</p>
          </div>
        )
      ) : (
        <div className="flex items-start gap-3" role="status">
          <Icon
            size={20}
            className="size-10 shrink-0 rounded-sm bg-gray-50 p-2.5 text-gray-700"
            aria-hidden
          />
          <div className="min-w-0 space-y-2">
            <p className="font-medium">{text}</p>
            {review && review.status !== "pending" && review.reviewNote && (
              <p className="text-body-sm break-words whitespace-pre-wrap text-gray-700">
                {review.reviewNote}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
