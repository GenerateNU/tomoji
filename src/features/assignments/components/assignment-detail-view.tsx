"use client";

import { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireAccount } from "@/features/users/components/require-account";
import { formatCompensation } from "@/lib/money";
import { assignmentStatusLabel, submissionStatusLabel } from "./assignment-status";

type AssignmentDetails = NonNullable<FunctionReturnType<typeof api.assignments.getMineDetails>>;

/** Opens the assignment workspace after the creator's account is resolved. */
export function AssignmentDetailView({ assignmentId }: { assignmentId: string }) {
  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <RequireAccount
        role="creator"
        next={`/assignments/${assignmentId}`}
        wrongRole="Assignments are available to creators."
      >
        <AssignmentDetail assignmentId={assignmentId} />
      </RequireAccount>
    </section>
  );
}

/** Displays terms, the brief, and delivery progress for an owned assignment. */
function AssignmentDetail({ assignmentId }: { assignmentId: string }) {
  const details = useQuery(api.assignments.getMineDetails, { assignmentId });

  return (
    <>
      <Link
        href="/assignments"
        className="mb-6 inline-flex min-h-11 items-center text-sm hover:underline"
      >
        ← All assignments
      </Link>
      {details === undefined && (
        <Skeleton aria-label="Loading assignment" className="h-48 w-full" />
      )}
      {details === null && <h1 className="text-2xl font-semibold">Assignment unavailable</h1>}
      {details && <AssignmentWorkspace details={details} />}
    </>
  );
}

/** Shows the creator's current terms and the latest state of each deliverable. */
function AssignmentWorkspace({ details }: { details: AssignmentDetails }) {
  const { assignment, brief, companyName, deliverables, title } = details;
  return (
    <>
      <header className="mb-8">
        {companyName && <p className="mb-1 text-sm text-muted-foreground">{companyName}</p>}
        <h1 className="mb-3 text-2xl font-semibold break-words sm:text-3xl">
          {title ?? "Assignment"}
        </h1>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge>{assignmentStatusLabel[assignment.status]}</Badge>
          <span>{formatCompensation(assignment)}</span>
        </div>
      </header>
      <div className="grid items-start gap-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <section className="rounded-lg border p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">Deliverables</h2>
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
        <section className="rounded-lg border p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">Campaign brief</h2>
          {brief ? (
            <>
              <p className="mb-4 text-sm break-words whitespace-pre-wrap">{brief.description}</p>
              <dl className="space-y-3 text-sm">
                {[
                  ["Content requirements", brief.contentRequirements],
                  ["Prohibited claims", brief.prohibitedClaims],
                  ["Disclosure requirements", brief.disclosureRequirements],
                  ["Usage rights", brief.usageRights],
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
      </div>
    </>
  );
}
