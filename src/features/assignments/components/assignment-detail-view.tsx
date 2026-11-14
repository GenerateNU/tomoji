"use client";

import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AssignmentsView } from "./assignments-view";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireAccount } from "@/features/users/components/require-account";
import { formatCompensation } from "@/lib/money";
import { assignmentStatusLabel, submissionStatusLabel } from "./assignment-status";

type AssignmentDetails = NonNullable<FunctionReturnType<typeof api.assignments.getMineDetails>>;

/** Opens the assignment workspace after the creator's account is resolved. */
export function AssignmentDetailView({ assignmentId }: { assignmentId: string }) {
  return (
    <>
      <AssignmentsView />
      <RequireAccount
        role="creator"
        next={`/assignments/${assignmentId}`}
        wrongRole="Assignments are available to creators."
      >
        <AssignmentDetail assignmentId={assignmentId} />
      </RequireAccount>
    </>
  );
}

/** Displays the assignment in a focused panel above the assignments table. */
function AssignmentDetail({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const details = useQuery(api.assignments.getMineDetails, { assignmentId });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.replace("/assignments");
      }}
    >
      <DialogContent className="max-w-[792px] content-start gap-0 overflow-y-auto rounded-2xl px-5 py-8 shadow-2xl sm:px-[76px] sm:py-[72px]">
        <DialogTitle className="text-[26px] leading-tight">
          {details?.title ?? (details === null ? "Assignment unavailable" : "Assignment")}
        </DialogTitle>
        <DialogDescription className="sr-only">Assignment brief and submissions</DialogDescription>
        {details === undefined && (
          <Skeleton aria-label="Loading assignment" className="mt-6 h-48 w-full" />
        )}
        {details === null && (
          <Link href="/assignments" className="mt-4 text-sm underline">
            All assignments
          </Link>
        )}
        {details && <AssignmentWorkspace details={details} />}
      </DialogContent>
    </Dialog>
  );
}

/** Shows the creator's current terms and the latest state of each deliverable. */
function AssignmentWorkspace({ details }: { details: AssignmentDetails }) {
  const { assignment, brief, companyName, deliverables } = details;
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-body-sm text-gray-700">
        {companyName && <span>{companyName}</span>}
        <Badge>{assignmentStatusLabel[assignment.status]}</Badge>
      </div>
      <div className="mt-8 space-y-7">
        <section className="border-t pt-7">
          <h2 className="mb-4 text-body-lg font-medium">Your submissions</h2>
          {deliverables.length === 0 && (
            <p className="text-sm text-muted-foreground">No deliverables yet.</p>
          )}
          <ul className="divide-y">
            {deliverables.map(({ _id, title, description, latest }) => (
              <li key={_id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-medium break-words">{title}</h3>
                  <Badge>{latest ? submissionStatusLabel[latest.status] : "To do"}</Badge>
                </div>
                <p className="mt-1 text-sm break-words whitespace-pre-wrap text-muted-foreground">
                  {description}
                </p>
              </li>
            ))}
          </ul>
        </section>
        <section className="border-t pt-7">
          <h2 className="mb-4 text-body-sm font-medium text-gray-500">Assignment</h2>
          {brief ? (
            <>
              <p className="mb-4 text-sm break-words whitespace-pre-wrap">{brief.description}</p>
              <dl className="space-y-3 text-sm">
                {[
                  ["Content requirements", brief.contentRequirements],
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
        <section>
          <h2 className="mb-2 text-body-sm font-medium text-gray-500">Payment</h2>
          <p className="text-body-sm">{formatCompensation(assignment)}</p>
        </section>
      </div>
    </>
  );
}
