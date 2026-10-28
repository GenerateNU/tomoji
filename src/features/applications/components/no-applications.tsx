"use client";

import { Button } from "@/components/ui/button";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "../lib/application-status";

/** Shown instead of the list, with a way out of whichever filter emptied it. */
export function NoApplications({
  status,
  onShowAll,
  onBack,
}: {
  status: ApplicationStatus | null;
  onShowAll: () => void;
  onBack?: () => void;
}) {
  if (onBack !== undefined) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground">There are no more applications.</p>
        <Button variant="secondary" onClick={onBack}>
          Previous page
        </Button>
      </div>
    );
  }
  if (status !== null) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground">
          You have no applications marked &ldquo;{APPLICATION_STATUS_LABELS[status]}&rdquo;.
        </p>
        <Button variant="secondary" onClick={onShowAll}>
          Show all statuses
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="font-medium">You haven&apos;t applied to anything yet.</p>
      <p className="text-muted-foreground">
        When you apply to an opportunity, you can follow its status here.
      </p>
    </div>
  );
}
