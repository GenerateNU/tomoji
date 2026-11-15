import type { api } from "@convex/_generated/api";
import { RiCloseLine, RiFlagLine } from "@remixicon/react";
import type { FunctionReturnType } from "convex/server";
import type { ReactNode } from "react";

export type RejectedSubmission = Extract<
  FunctionReturnType<typeof api.submissions.get>,
  { status: "changesRequested" }
>;

/** Pairs the original draft with the requirements that need changes. */
export function SubmissionRejection({
  submission,
  preview,
  children,
}: {
  submission: RejectedSubmission;
  preview: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[910px] space-y-8 sm:space-y-10">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="min-w-0">{preview}</div>
        <SubmissionRejectionFeedback submission={submission} />
      </div>
      <div className="mx-auto flex w-full max-w-[446px] flex-col gap-3">{children}</div>
    </div>
  );
}

/** Shows the saved review feedback for a rejected draft. */
export function SubmissionRejectionFeedback({ submission }: { submission: RejectedSubmission }) {
  const criteria = submission.aiReview?.failedCriteria;

  return (
    <section
      aria-label="Review feedback"
      className="min-w-0 space-y-5 rounded-lg bg-gray-0 p-5 shadow-raised"
    >
      <div className="flex items-start gap-3">
        <RiCloseLine
          className="size-7 shrink-0 rounded-sm bg-red-100 p-1.5 text-red-700"
          aria-hidden
        />
        <p>
          Your submission has been rejected. Review the reasons below and resubmit after adjusting.
        </p>
      </div>
      <ul className="space-y-5">
        {criteria?.length ? (
          criteria.map(({ id, description }) => (
            <RejectionReason key={id} title="Requirement not met" description={description} />
          ))
        ) : (
          <RejectionReason title="Reviewer feedback" description={submission.reviewNote} />
        )}
      </ul>
    </section>
  );
}

/** Shows one review reason with the same flag and text hierarchy as the other reasons. */
function RejectionReason({ title, description }: { title: string; description: string }) {
  return (
    <li className="flex items-start gap-3">
      <RiFlagLine
        className="size-7 shrink-0 rounded-sm bg-red-100 p-1.5 text-red-700"
        aria-hidden
      />
      <div className="min-w-0 space-y-1">
        <p>{title}</p>
        <p className="text-body-sm wrap-anywhere whitespace-pre-wrap text-gray-600">
          {description}
        </p>
      </div>
    </li>
  );
}
