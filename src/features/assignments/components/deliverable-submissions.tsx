"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { aiReviewStatusLabel, submissionStatusLabel } from "./assignment-status";
import { DraftComposer } from "./draft-composer";
import { SubmissionPreview } from "./submission-preview";
import { SubmittedVideo } from "./submitted-video";

type Submission = FunctionReturnType<typeof api.submissions.get>;

type Props = {
  assignmentId: Id<"assignments">;
  deliverableId: Id<"deliverables">;
  assignmentTitle: string;
  usesAiReview: boolean;
  composing: boolean;
  onComposingChange: (open: boolean) => void;
  showDraftTrigger: boolean;
  submissionId?: Id<"submissions">;
  active: boolean;
};

/** Shows the latest review and the draft actions available for this deliverable. */
export function DeliverableSubmissions({
  assignmentId,
  deliverableId,
  assignmentTitle,
  usesAiReview,
  composing,
  onComposingChange,
  showDraftTrigger,
  submissionId,
  active,
}: Props) {
  const latest = useQuery(api.submissions.get, submissionId ? { submissionId } : "skip");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [revising, setRevising] = useState<Id<"submissions">>();
  const [reviewId, setReviewId] = useState<Id<"submissions">>();
  const [draftInFlight, setDraftInFlight] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [submittedFrom, setSubmittedFrom] = useState<Id<"submissions"> | null>();
  const rejectedDraft = useQuery(
    api.submissions.get,
    revising ? { submissionId: revising } : "skip",
  );
  const previous = rejectedDraft ?? (latest?.status === "changesRequested" ? latest : undefined);
  const busy = submissionId !== undefined && latest === undefined;
  const canSubmit =
    active &&
    !busy &&
    submittedFrom !== (submissionId ?? null) &&
    (!latest || latest.status === "changesRequested");

  function closeComposer() {
    setReviewId(undefined);
    setRevising(undefined);
    onComposingChange(false);
  }

  return (
    <div className="mt-3 space-y-3">
      {busy && <Skeleton aria-label="Loading review" className="h-10 w-full" />}
      {latest?.status === "changesRequested" ? (
        <Dialog open={commentsOpen} onOpenChange={setCommentsOpen}>
          <DialogTrigger render={<Button type="button" variant="secondary-subtle" />}>
            View comments
          </DialogTrigger>
          <DialogContent
            className="min-h-[min(79.4dvh,780px)] max-w-[1186px] content-center overflow-y-auto bg-gray-50 px-5 py-14 shadow-2xl"
            overlayClassName="bg-gray-950/20 backdrop-blur-[2px]"
          >
            <div className="mx-auto w-full max-w-[446px] space-y-5">
              <SubmissionPreview caption={latest.caption}>
                {latest.mediaId && <SubmittedVideo mediaId={latest.mediaId} eager />}
              </SubmissionPreview>
              <div className="space-y-3 rounded-lg bg-gray-0 p-5">
                <DialogTitle className="sr-only">Submission comments</DialogTitle>
                <DialogDescription className="text-gray-950">
                  Your submission has been rejected. Review the reasons below and resubmit after
                  adjusting.
                </DialogDescription>
                {latest.reviewNote && (
                  <p className="text-body-sm break-words whitespace-pre-wrap text-gray-700">
                    {latest.reviewNote}
                  </p>
                )}
              </div>
              {canSubmit && (
                <Button
                  type="button"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setCommentsOpen(false);
                    onComposingChange(true);
                  }}
                >
                  Resubmit
                </Button>
              )}
              <Button
                type="button"
                size="sm"
                variant="secondary-ghost"
                className="w-full"
                onClick={() => setCommentsOpen(false)}
              >
                Not now
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        latest && <SubmissionFeedback submission={latest} />
      )}
      {(canSubmit || draftInFlight || reviewId || revising) && (
        <Dialog
          open={composing}
          onOpenChange={(next) => {
            if (draftInFlight) return;
            if (!next) closeComposer();
            else if (canSubmit) onComposingChange(true);
          }}
          disablePointerDismissal
        >
          {showDraftTrigger && canSubmit && (
            <DialogTrigger render={<Button type="button" size="sm" />}>
              {latest ? "Resubmit" : "Submit assignment"}
            </DialogTrigger>
          )}
          <DialogContent
            className="max-w-[1186px] gap-0 overflow-y-auto rounded-lg shadow-2xl"
            overlayClassName="bg-gray-950/20 backdrop-blur-[2px]"
            showCloseButton={false}
          >
            {revising && !rejectedDraft ? (
              <Skeleton aria-label="Loading draft" className="m-8 h-24" />
            ) : (
              <DraftComposer
                key={revising ?? "draft"}
                assignmentId={assignmentId}
                deliverableId={deliverableId}
                assignmentTitle={assignmentTitle}
                usesAiReview={usesAiReview}
                previous={previous}
                reviewId={reviewId}
                onCancel={closeComposer}
                onRevise={(id) => {
                  setReviewId(undefined);
                  setRevising(id);
                }}
                onBusyChange={setDraftInFlight}
                onSubmitted={(id) => {
                  setSubmittedFrom(submissionId ?? null);
                  if (usesAiReview) setReviewId(id);
                  else closeComposer();
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      )}
      {latest && (
        <>
          <Button
            type="button"
            size="sm"
            variant="secondary-ghost"
            aria-expanded={showHistory}
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? "Hide submission history" : "Submission history"}
          </Button>
          {showHistory && (
            <SubmissionHistory assignmentId={assignmentId} deliverableId={deliverableId} />
          )}
        </>
      )}
    </div>
  );
}

/** Explains the current review state using only recorded results and reviewer feedback. */
function SubmissionFeedback({ submission }: { submission: Submission }) {
  const { aiReview, status, caption, mediaId } = submission;
  return (
    <div className="space-y-2 rounded-md bg-gray-25 p-3 text-sm">
      <div role="status" className="space-y-1">
        {status === "pending" && (
          <p className="font-medium">
            {submission.closedWithoutReview
              ? "Closed without review"
              : aiReview
                ? aiReviewStatusLabel[aiReview.status]
                : "Waiting for a reviewer"}
          </p>
        )}
        {status !== "pending" && submission.reviewNote && (
          <p className="break-words whitespace-pre-wrap">{submission.reviewNote}</p>
        )}
      </div>
      {caption && <p className="break-words whitespace-pre-wrap">{caption}</p>}
      {mediaId && <SubmittedVideo mediaId={mediaId} />}
    </div>
  );
}

/** Paginates only the opened deliverable's previous drafts. */
function SubmissionHistory({
  assignmentId,
  deliverableId,
}: Pick<Props, "assignmentId" | "deliverableId">) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.submissions.list,
    { assignmentId, deliverableId },
    { initialNumItems: 5 },
  );
  if (status === "LoadingFirstPage")
    return <Skeleton aria-label="Loading submissions" className="h-12" />;
  return (
    <>
      <ol className="divide-y rounded-md border text-sm">
        {results.map((submission) => (
          <li key={submission._id} className="space-y-2 p-3">
            <p className="font-medium">
              {submission.closedWithoutReview
                ? "Closed without review"
                : submissionStatusLabel[submission.status]}
            </p>
            <time
              className="text-muted-foreground"
              dateTime={new Date(submission._creationTime).toISOString()}
            >
              {new Date(submission._creationTime).toLocaleDateString()}
            </time>
            <p className="break-words whitespace-pre-wrap">{submission.draftDescription}</p>
            <SubmissionFeedback submission={submission} />
          </li>
        ))}
      </ol>
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(5)}
        >
          Load earlier drafts
        </Button>
      )}
    </>
  );
}
