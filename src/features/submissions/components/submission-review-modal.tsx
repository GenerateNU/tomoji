"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, usePaginatedQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Modal } from "@/components/modal";
import { TextAreaField } from "@/components/text-area-field";
import { Avatar, getInitials } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { aiReviewStatusLabel } from "@/features/assignments/components/assignment-status";
import { SubmittedVideo } from "@/features/assignments/components/submitted-video";
import { useNow } from "@/hooks/use-now";
import { errorMessage, errorReason } from "@/lib/errors";
import { formatRelativeTime } from "@/lib/relative-time";
import { labels, type SubmissionQueueRow } from "../lib/queue";

type Draft = FunctionReturnType<typeof api.submissions.list>["page"][number];
const noteLimit = 200;
const historyPageSize = 8;

/** Lets company reviewers inspect the content and make a decision for the current round. */
export function SubmissionReviewModal({
  row,
  onClose,
}: {
  row: SubmissionQueueRow;
  onClose: () => void;
}) {
  const [attempt, setAttempt] = useState(0);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      eyebrow={<p className="text-body font-normal text-gray-600">{row.campaignTitle}</p>}
      title={row.title}
      titleSize="xl"
      className="max-w-[1120px] shadow-overlay"
    >
      <ErrorBoundary
        key={attempt}
        fallback={() => (
          <div role="alert" className="space-y-3 p-1">
            <p>We couldn’t open this submission.</p>
            <Button size="sm" onClick={() => setAttempt(attempt + 1)}>
              Try again
            </Button>
          </div>
        )}
      >
        <SubmissionRounds row={row} />
      </ErrorBoundary>
    </Modal>
  );
}

/** Reads real submission history, scoped by the existing assignment and deliverable checks. */
function SubmissionRounds({ row }: { row: SubmissionQueueRow }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.submissions.list,
    { assignmentId: row.assignmentId, deliverableId: row.deliverableId },
    { initialNumItems: historyPageSize },
  );
  const [selected, setSelected] = useState<Id<"submissions">>();
  const roundScroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scroller = roundScroller.current;
    if (selected === undefined && scroller) scroller.scrollLeft = scroller.scrollWidth;
  }, [results.length, selected]);
  const now = useNow();
  if (status === "LoadingFirstPage")
    return (
      <Skeleton
        className="aspect-video w-full"
        role="status"
        aria-label="Loading submission rounds"
      />
    );
  const latest = results[0];
  if (!latest)
    return <p className="text-body-sm text-gray-500">There are no drafts for this deliverable.</p>;
  const active = results.find((draft) => draft._id === selected) ?? latest;
  const newestNumber =
    status === "Exhausted" ? results.length : !row.roundIsCapped ? row.round : undefined;
  return (
    <Tabs
      className="gap-4 p-1"
      value={active._id}
      onValueChange={(value) => setSelected(results.find((draft) => draft._id === value)?._id)}
    >
      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="secondary-subtle"
            disabled={status === "LoadingMore"}
            onClick={() => loadMore(historyPageSize)}
          >
            {status === "LoadingMore" ? "Loading rounds…" : "Load earlier rounds"}
          </Button>
        </div>
      )}
      <div ref={roundScroller} className="overflow-x-auto">
        <TabsList aria-label="Submission rounds" className="w-max min-w-full">
          {[...results].reverse().map((draft, index) => {
            const roundsBack = results.length - 1 - index;
            return (
              <TabsTrigger key={draft._id} value={draft._id}>
                {newestNumber !== undefined && newestNumber > roundsBack
                  ? `Round ${newestNumber - roundsBack}`
                  : roundsBack === 0
                    ? "Latest round"
                    : `Previous round ${roundsBack}`}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </div>
      <TabsContent value={active._id} key={active._id}>
        <DraftReview
          draft={active}
          creatorName={row.creatorName}
          isCurrent={active._id === latest._id}
          now={now}
        />
      </TabsContent>
    </Tabs>
  );
}

/** Shows submitted content and either the recorded review or decision controls. */
function DraftReview({
  draft,
  creatorName,
  isCurrent,
  now,
}: {
  draft: Draft;
  creatorName: string;
  isCurrent: boolean;
  now: number;
}) {
  const ai = draft.aiReview;
  const waitingForAi = ai && ai.status !== "manualReview" && ai.status !== "completed";
  return (
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      <div className="min-w-0 space-y-4 rounded-lg bg-gray-0 p-4 shadow-raised">
        <div className="flex items-center gap-3">
          <Avatar size={40} initials={getInitials(creatorName)} />
          <div className="min-w-0">
            <p className="text-body font-medium wrap-anywhere">{creatorName}</p>
            <p className="text-body-sm font-normal text-gray-500">
              Submitted{" "}
              <time dateTime={new Date(draft._creationTime).toISOString()}>
                {formatRelativeTime(draft._creationTime, now)}
              </time>
            </p>
          </div>
        </div>
        {draft.caption && (
          <p className="text-body font-normal whitespace-pre-wrap wrap-anywhere">{draft.caption}</p>
        )}
        {draft.mediaId && <SubmittedVideo mediaId={draft.mediaId} eager />}
      </div>
      <div className="min-w-0 space-y-3 self-start rounded-lg border border-gray-100 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xl font-medium">Review</h3>
          <Badge
            tone={draft.status === "pending" && !draft.closedWithoutReview ? "primary" : "neutral"}
          >
            {draft.closedWithoutReview ? "Closed" : labels[draft.status]}
          </Badge>
        </div>
        <div className="space-y-1">
          <h4 className="text-body-sm font-medium text-gray-700">Creator note</h4>
          <p className="text-body-sm font-normal whitespace-pre-wrap wrap-anywhere text-gray-500">
            {draft.draftDescription}
          </p>
        </div>
        {draft.status !== "pending" && draft.reviewNote && (
          <div className="space-y-1 border-t border-gray-100 pt-3">
            <h4 className="text-body-sm font-medium text-gray-700">Review feedback</h4>
            <p className="text-body-sm font-normal whitespace-pre-wrap wrap-anywhere text-gray-500">
              {draft.reviewNote}
            </p>
          </div>
        )}
        {draft.status === "pending" &&
          isCurrent &&
          !draft.closedWithoutReview &&
          (waitingForAi ? (
            <p role="status" className="text-body-sm text-gray-500">
              {aiReviewStatusLabel[ai.status]}
            </p>
          ) : (
            <ReviewDecision submissionId={draft._id} />
          ))}
      </div>
    </div>
  );
}

/** Feedback is saved with a decision, using the same mutation as existing reviews. */
function ReviewDecision({ submissionId }: { submissionId: Id<"submissions"> }) {
  const review = useMutation(api.submissions.review);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(decision: "approved" | "changesRequested") {
    const feedback = note.trim();
    if (decision === "changesRequested" && !feedback) {
      setError("Tell the creator what they need to change.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      await review({
        submissionId,
        review:
          decision === "approved"
            ? { status: decision, reviewNote: feedback || undefined }
            : { status: decision, reviewNote: feedback },
      });
    } catch (failure) {
      setError(
        errorReason(failure) === "already_reviewed"
          ? "Someone already reviewed this round."
          : errorMessage(failure),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 border-t border-gray-100 pt-3">
      <TextAreaField
        className="[&_[data-slot=label]]:text-xl [&_[data-slot=label]]:text-gray-950"
        label="Write a note"
        placeholder="Tell the creator what to change, or what worked."
        maxLength={noteLimit}
        value={note}
        error={error}
        disabled={busy}
        onChange={(event) => {
          setNote(event.target.value);
          setError(undefined);
        }}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary-subtle"
          disabled={busy}
          onClick={() => void submit("changesRequested")}
        >
          Request changes
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={() => void submit("approved")}>
          Approve
        </Button>
      </div>
    </div>
  );
}
