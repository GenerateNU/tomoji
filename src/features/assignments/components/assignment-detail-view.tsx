"use client";

import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { formatCompensation } from "@/lib/money";
import { assignmentStatusLabel, submissionStatusLabel } from "./assignment-status";

type AssignmentDetails = NonNullable<FunctionReturnType<typeof api.assignments.getMineDetails>>;

/** Opens the assignment workspace after the creator's account is resolved. */
export function AssignmentDetailView({
  assignmentId,
  status,
}: {
  assignmentId: string;
  status?: string;
}) {
  return (
    <>
      <AssignmentsView status={status} />
      <RequireAccount
        role="creator"
        next={`/assignments/${assignmentId}`}
        wrongRole="Assignments are available to creators."
      >
        <AssignmentDetail assignmentId={assignmentId} status={status} />
      </RequireAccount>
    </>
  );
}

/** Displays the assignment in a focused panel above the assignments table. */
function AssignmentDetail({ assignmentId, status }: { assignmentId: string; status?: string }) {
  const back = `/assignments?status=${assignmentQueue(status)}`;
  const router = useRouter();
  const details = useQuery(api.assignments.getMineDetails, { assignmentId });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.replace(back);
      }}
    >
      <DialogContent
        className="grid h-[min(720px,calc(100dvh-32px))] max-w-[742px] grid-rows-[minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-lg shadow-2xl"
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
          <DialogTitle className="text-[26px] leading-tight">
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
          {details && <AssignmentWorkspace details={details} />}
        </div>
        <div className="flex justify-end gap-2 bg-gray-0 px-5 py-6 sm:px-8">
          <DialogClose render={<Button variant="secondary-subtle" />}>Close</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Shows the creator's current terms and the latest state of each deliverable. */
function AssignmentWorkspace({ details }: { details: AssignmentDetails }) {
  const { assignment, brief, deliverables } = details;
  const assignedOn = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(assignment._creationTime);
  return (
    <>
      <p className="mt-4 text-body-sm text-gray-500">Assigned {assignedOn}</p>
      {assignment.status !== "active" && (
        <Badge className="mt-2">{assignmentStatusLabel[assignment.status]}</Badge>
      )}
      <div className="mt-8 space-y-7">
        <section>
          <h2 className="mb-2 text-body-sm font-medium text-gray-500">Content requirements</h2>
          {brief ? (
            <>
              <p className="mb-4 text-sm break-words whitespace-pre-wrap">{brief.description}</p>
              <dl className="space-y-3 text-sm">
                {[
                  ["Deliverable guidelines", brief.contentRequirements],
                  ["Review policy", brief.reviewPolicy],
                ].map(
                  ([label, value]) =>
                    value && (
                      <div key={label}>
                        <dt className="font-medium">{label}</dt>
                        <dd className="break-words whitespace-pre-wrap text-muted-foreground">
                          {value}
                        </dd>
                      </div>
                    ),
                )}
              </dl>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Brief unavailable.</p>
          )}
        </section>
        <section className="border-t pt-7">
          <h2 className="mb-4 text-body-lg font-medium">Your submissions</h2>
          {deliverables.length === 0 && (
            <p className="text-sm text-muted-foreground">No deliverables yet.</p>
          )}
          <ul className="divide-y">
            {deliverables.map(({ _id, title, description, latest, exampleMediaIds }) => (
              <li key={_id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-medium break-words">{title}</h3>
                  <Badge>{latest ? submissionStatusLabel[latest.status] : "To do"}</Badge>
                </div>
                <p className="mt-1 text-sm break-words whitespace-pre-wrap text-muted-foreground">
                  {description}
                </p>
                {!!exampleMediaIds?.length && (
                  <AssignmentExamples deliverableId={_id} mediaIds={exampleMediaIds} />
                )}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="mb-2 text-body-sm font-medium text-gray-500">Payment</h2>
          <p className="text-body-sm">{formatCompensation(assignment)}</p>
        </section>
      </div>
    </>
  );
}
