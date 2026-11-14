"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, usePaginatedQuery, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { submissionStatusLabel } from "./assignment-status";
import { DraftComposer } from "./draft-composer";

type Submission = FunctionReturnType<typeof api.submissions.get>;

type Props = {
  assignmentId: Id<"assignments">;
  deliverableId: Id<"deliverables">;
  assignmentTitle: string;
  usesAiReview: boolean;
  startDraft: boolean;
  submissionId?: Id<"submissions">;
  active: boolean;
};

const aiStatus = {
  ready: "Queued for AI review",
  transcribing: "Transcribing video",
  evaluating: "Checking the draft against the brief",
  manualReview: "Waiting for a human reviewer",
  completed: "AI review complete",
} satisfies Record<NonNullable<Submission["aiReview"]>["status"], string>;

/** Shows the latest review and the draft actions available for this deliverable. */
export function DeliverableSubmissions({
  assignmentId,
  deliverableId,
  assignmentTitle,
  usesAiReview,
  startDraft,
  submissionId,
  active,
}: Props) {
  const latest = useQuery(api.submissions.get, submissionId ? { submissionId } : "skip");
  const [composing, setComposing] = useState(startDraft);
  const [draftInFlight, setDraftInFlight] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [submittedFrom, setSubmittedFrom] = useState<Id<"submissions"> | null>();
  const busy = submissionId !== undefined && latest === undefined;
  const canSubmit =
    active &&
    !busy &&
    submittedFrom !== (submissionId ?? null) &&
    (!latest || latest.status === "changesRequested");

  return (
    <div className="mt-3 space-y-3">
      {busy && <Skeleton aria-label="Loading review" className="h-10 w-full" />}
      {latest && <SubmissionFeedback submission={latest} />}
      {(canSubmit || draftInFlight) && (
        <Dialog
          open={composing}
          onOpenChange={(next) => {
            if (!draftInFlight) setComposing(next);
          }}
          disablePointerDismissal
        >
          <DialogTrigger render={<Button type="button" size="sm" />}>
            {latest ? "Revise draft" : "Add draft"}
          </DialogTrigger>
          <DialogContent
            className="max-w-[1186px] gap-0 overflow-y-auto rounded-2xl shadow-2xl"
            overlayClassName="bg-gray-950/20 backdrop-blur-[2px]"
            showCloseButton={false}
          >
            <DraftComposer
              assignmentId={assignmentId}
              deliverableId={deliverableId}
              assignmentTitle={assignmentTitle}
              usesAiReview={usesAiReview}
              previous={latest?.status === "changesRequested" ? latest : undefined}
              onCancel={() => setComposing(false)}
              onBusyChange={setDraftInFlight}
              onSubmitted={() => {
                setSubmittedFrom(submissionId ?? null);
                setComposing(false);
              }}
            />
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
                ? aiStatus[aiReview.status]
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

/** Requests a fresh private video URL on intent and lets the creator retry playback. */
function SubmittedVideo({ mediaId }: { mediaId: Id<"mediaUploads"> }) {
  const getVideoUrl = useAction(api.media.getVideoUrl);
  const [url, setUrl] = useState<string>();
  const [state, setState] = useState<"loading" | "error">();
  async function loadVideo() {
    setState("loading");
    try {
      setUrl((await getVideoUrl({ mediaId })).url);
      setState(undefined);
    } catch {
      setState("error");
    }
  }
  if (url)
    return (
      <video
        aria-label="Submitted video"
        src={url}
        controls
        playsInline
        className="max-h-64 w-full rounded bg-gray-950"
        onError={() => {
          setUrl(undefined);
          setState("error");
        }}
      />
    );
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={state === "loading"}
        onClick={loadVideo}
      >
        {state === "loading"
          ? "Loading video…"
          : state === "error"
            ? "Retry video"
            : "View submitted video"}
      </Button>
      {state === "error" && <p role="alert">Couldn’t load this video. Try again.</p>}
    </>
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
