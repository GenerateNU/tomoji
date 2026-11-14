import type { Doc } from "@convex/_generated/dataModel";
import type { ReactNode } from "react";
import { formatModalDate } from "./lib/format";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-body-lg font-medium text-gray-950">{title}</h3>
      {children}
    </section>
  );
}

/** One assignment's requirements, read-only. Editing happens in DeliverableForm. */
export function DeliverableDetails({
  deliverable,
  deadline,
  notice,
}: {
  deliverable: Doc<"deliverables">;
  /** The opportunity's deadline; assignments don't have their own. */
  deadline: number;
  /** Why it can't be edited, when it can't. */
  notice?: ReactNode;
}) {
  const criteria = deliverable.reviewCriteria ?? [];
  return (
    <div className="flex flex-col gap-6">
      {notice}
      <Section title="Content requirements">
        <p className="text-body whitespace-pre-line text-gray-950">{deliverable.description}</p>
      </Section>
      <Section title="Review criteria">
        {criteria.length > 0 ? (
          <ul className="flex list-disc flex-col gap-1 pl-5 text-body text-gray-950 marker:text-gray-500">
            {criteria.map((criterion) => (
              <li key={criterion.id}>{criterion.description}</li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-gray-500">
            None yet. Drafts are reviewed against the opportunity&apos;s review policy.
          </p>
        )}
      </Section>
      <dl className="flex flex-wrap gap-x-10 gap-y-4">
        <div className="flex flex-col gap-1">
          <dt className="text-body-sm text-gray-500">Deadline</dt>
          <dd className="text-body text-gray-950">{formatModalDate(deadline)}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-body-sm text-gray-500">Created</dt>
          <dd className="text-body text-gray-950">{formatModalDate(deliverable._creationTime)}</dd>
        </div>
      </dl>
    </div>
  );
}
