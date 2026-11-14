import { Tag } from "@/components/ui/badge";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "../lib/application-status";

/** Rejection is the one outcome that reads as bad news; everything else is neutral. */
export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <Tag size="md" tone={status === "rejected" ? "destructive" : "neutral"}>
      {APPLICATION_STATUS_LABELS[status]}
    </Tag>
  );
}
