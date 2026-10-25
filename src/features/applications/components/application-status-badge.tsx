import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "../lib/application-status";

export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-sm font-medium whitespace-nowrap text-muted-foreground">
      {APPLICATION_STATUS_LABELS[status]}
    </span>
  );
}
