"use client";

import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { assignmentQueue, AssignmentsView } from "./assignments-view";
import { AssignmentExamples } from "./assignment-examples";
import { AssignmentCompany } from "./assignment-company";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireAccount } from "@/features/users/components/require-account";
import { assignmentStatusLabel } from "./assignment-status";
import { AssignmentSubmission } from "./assignment-submission";
import { DeliverableSubmissions } from "./deliverable-submissions";

type AssignmentDetails = NonNullable<FunctionReturnType<typeof api.assignments.getMineDetails>>;

/** Opens the assignment workspace after the creator's account is resolved. */
type AssignmentSelection = {
  assignmentId: string;
  status?: string;
  task?: string;
  deliverable?: string;
};

export function AssignmentDetailView(selection: AssignmentSelection) {
  const { assignmentId, task } = selection;
  const status = selection.status ?? (task === "post" ? "approved" : undefined);
  return (
    <>
      <AssignmentsView stage="post" status={status} />
      <RequireAccount
        role="creator"
        next={`/assignments/${assignmentId}`}
        wrongRole="Assignments are available to creators."
      >
        <AssignmentDetail {...selection} status={status} />
      </RequireAccount>
    </>
  );
}

/** Displays the assignment in a focused panel above the assignments table. */
function AssignmentDetail({ assignmentId, status, task, deliverable }: AssignmentSelection) {
  const back = `/assignments?status=${assignmentQueue(status)}`;
  const router = useRouter();
  const details = useQuery(api.assignments.getMineDetails, { assignmentId });
  const [draftTarget, setDraftTarget] = useState(task === "draft" ? deliverable : undefined);
  const deliverables = details?.deliverables;
  const onlyDeliverable = deliverables?.length === 1 ? deliverables[0] : undefined;
  const footerDraft =
    details?.assignment.status === "active" &&
    onlyDeliverable &&
    (!onlyDeliverable.latest || onlyDeliverable.latest.status === "changesRequested")
      ? onlyDeliverable
      : undefined;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.replace(back);
      }}
    >
      <DialogContent
        initialFocus={false}
        className="grid h-[min(720px,calc(100dvh-32px))] max-w-[742px] grid-rows-[minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-lg shadow-2xl data-nested-dialog-open:opacity-0"
        overlayClassName="bg-gray-950/20 backdrop-blur-[2px]"
      >
        <div className="overflow-y-auto px-5 py-8 sm:px-8">
          {details && (
            <div className="mb-4 flex flex-wrap items-center gap-2 text-body-sm">
              <AssignmentCompany name={details.companyName} mediaId={details.companyPictureId} />
              {details.title && <span className="text-gray-500">/</span>}
              {details.title && <span className="font-medium">{details.title}</span>}
            </div>
          )}
          <DialogTitle className="text-[28px] leading-tight">
            {details?.deliverables[0]?.title ??
              details?.title ??
              (details === null ? "Assignment unavailable" : "Assignment")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Assignment brief and submissions
          </DialogDescription>
          {details === undefined && (
            <Skeleton aria-label="Loading assignment" className="mt-6 h-48 w-full" />
          )}
          {details === null && (
            <Link href={back} className="mt-4 text-sm underline">
              All assignments
            </Link>
          )}
          {details && (
            <AssignmentWorkspace
              details={details}
              draftTarget={draftTarget}
              setDraftTarget={setDraftTarget}
              footerDraft={footerDraft?._id}
              postTarget={task === "post" ? deliverable : undefined}
            />
          )}
        </div>
        <div className="flex justify-end gap-2 bg-gray-0 px-5 py-6 sm:px-8">
          <DialogClose render={<Button variant="secondary-subtle" />}>Close</DialogClose>
          {footerDraft && (
            <Button type="button" onClick={() => setDraftTarget(footerDraft._id)}>
              {footerDraft.latest ? "Resubmit" : "Submit assignment"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Shows the creator's current terms and the latest state of each deliverable. */
function AssignmentWorkspace({
  details,
  draftTarget,
  setDraftTarget,
  footerDraft,
  postTarget,
}: {
  details: AssignmentDetails;
  draftTarget?: string;
  setDraftTarget: (target: string | undefined) => void;
  footerDraft?: string;
  postTarget?: string;
}) {
  const { assignment, brief, deliverables } = details;
  const assignedOn = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(assignment._creationTime);
  const published = useQuery(api.posts.list, {
    assignmentId: assignment._id,
    paginationOpts: { cursor: null, numItems: 12 },
  });
  const postsBySubmission = new Map(published?.page.map((post) => [post.submissionId, post]));
  return (
    <>
      <p className="mt-4 text-body-sm text-gray-500">Assigned {assignedOn}</p>
      {assignment.status !== "active" && (
        <Badge className="mt-2">{assignmentStatusLabel[assignment.status]}</Badge>
      )}
      <div className="mt-6 space-y-6">
        {deliverables.some(({ latest }) => latest) && (
          <section>
            <h2 className="mb-2 text-body-sm font-medium text-gray-500">Your submissions</h2>
            <ul className="space-y-3">
              {deliverables.map(
                ({ _id, title, latest }) =>
                  latest && (
                    <li key={_id}>
                      <AssignmentSubmission
                        key={latest._id}
                        title={title}
                        submissionId={latest._id}
                        onResubmit={
                          assignment.status === "active" ? () => setDraftTarget(_id) : undefined
                        }
                      />
                    </li>
                  ),
              )}
            </ul>
          </section>
        )}
        <section>
          <h2 className="mb-2 text-body-sm font-medium text-gray-500">Content requirements</h2>
          {brief ? (
            <p className="text-sm break-words whitespace-pre-wrap">{brief.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Brief unavailable.</p>
          )}
        </section>
        {deliverables.length > 0 && (
          <section className="space-y-4" aria-label="Deliverables">
            {deliverables.map(({ _id, title, latest, exampleMediaIds }) => (
              <div key={_id}>
                {deliverables.length > 1 && (
                  <h3 className="mb-2 font-medium break-words">{title}</h3>
                )}
                {!!exampleMediaIds?.length && (
                  <AssignmentExamples deliverableId={_id} mediaIds={exampleMediaIds} />
                )}
                <DeliverableSubmissions
                  assignmentId={assignment._id}
                  opportunityId={assignment.opportunityId}
                  deliverableId={_id}
                  assignmentTitle={title}
                  usesAiReview={assignment.usesAiReview}
                  composing={draftTarget === _id}
                  onComposingChange={(open) => setDraftTarget(open ? _id : undefined)}
                  showDraftTrigger={footerDraft !== _id}
                  startPost={postTarget === _id}
                  submissionId={latest?._id}
                  post={latest ? postsBySubmission.get(latest._id) : undefined}
                  postsLoading={published === undefined}
                  active={assignment.status === "active"}
                />
              </div>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
