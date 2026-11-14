"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { RiCloseLine, RiFileTextLine, RiVideoLine } from "@remixicon/react";
import { useQuery } from "convex/react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRelativeTime } from "@/lib/relative-time";
import { submissionStatusLabel } from "./assignment-status";
import { SubmissionPreview } from "./submission-preview";
import { SubmittedVideo } from "./submitted-video";

/** Summarizes the latest draft and opens the creator’s recorded feedback. */
export function AssignmentSubmission({
  submissionId,
  title,
}: {
  submissionId: Id<"submissions">;
  title: string;
}) {
  const submission = useQuery(api.submissions.get, { submissionId });
  const [now] = useState(() => Date.now());
  if (!submission) return <Skeleton aria-label="Loading submission" className="h-30 w-full" />;

  const changesNeeded = submission.status === "changesRequested";
  const status = submission.closedWithoutReview
    ? "Closed without review"
    : changesNeeded
      ? "Changes needed"
      : submissionStatusLabel[submission.status];
  const MediaIcon = submission.mediaId ? RiVideoLine : RiFileTextLine;

  return (
    <Dialog>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] rounded-lg bg-gray-0 p-4 shadow-[0_0_10px_rgb(0_0_0/0.05)] sm:p-6">
        <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-gray-50 text-gray-500 sm:size-20">
          <MediaIcon aria-hidden className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col items-start gap-1">
          <Badge tone={changesNeeded ? "destructive" : "neutral"}>{status}</Badge>
          <h3 className="text-body-lg font-medium break-words">{title}</h3>
          <time
            className="text-body-sm text-gray-500"
            dateTime={new Date(submission._creationTime).toISOString()}
          >
            Submitted {formatRelativeTime(submission._creationTime, now)}
          </time>
        </div>
        <DialogTrigger
          render={
            <Button
              type="button"
              variant="secondary-subtle"
              className="col-span-2 justify-self-end sm:col-span-1"
            />
          }
        >
          {changesNeeded ? "View comments" : "View submission"}
        </DialogTrigger>
      </div>
      <DialogContent
        className="min-h-[min(79.4dvh,780px)] max-w-[1186px] [align-content:safe_center] overflow-y-auto bg-gray-50 px-5 py-14 shadow-2xl"
        overlayClassName="bg-gray-950/20 backdrop-blur-[2px]"
      >
        <div className="mx-auto w-full max-w-[446px] space-y-5">
          <SubmissionPreview caption={submission.caption}>
            {submission.mediaId && <SubmittedVideo mediaId={submission.mediaId} eager />}
          </SubmissionPreview>
          <div className="space-y-3 rounded-lg bg-gray-0 p-5">
            <DialogTitle className="sr-only">
              {changesNeeded ? "Submission comments" : "Submission details"}
            </DialogTitle>
            <DialogDescription className="flex items-start gap-3 text-gray-950">
              {changesNeeded && (
                <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-gray-50">
                  <RiCloseLine aria-hidden size={18} />
                </span>
              )}
              {changesNeeded
                ? "Your submission has been rejected. Review the reasons below and resubmit after adjusting."
                : status}
            </DialogDescription>
            {submission.status !== "pending" && submission.reviewNote && (
              <p className="text-body-sm break-words whitespace-pre-wrap text-gray-700">
                {submission.reviewNote}
              </p>
            )}
            {!changesNeeded && (
              <p className="text-body-sm break-words whitespace-pre-wrap text-gray-700">
                {submission.draftDescription}
              </p>
            )}
          </div>
          <DialogClose
            render={<Button type="button" size="sm" variant="secondary-ghost" className="w-full" />}
          >
            {changesNeeded ? "Not now" : "Close"}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
