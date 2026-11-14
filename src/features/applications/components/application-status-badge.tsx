import { Tag } from "@/components/ui/badge";
import { APPLICATION_STATUS_LABELS, type ApplicationStatus } from "../lib/application-status";

/**
 * Rejection is the one outcome that reads as bad news; everything else is neutral.
 * `opportunityFull` is shown as a rejection: the label is overridden here rather than in
 * `APPLICATION_STATUS_LABELS` so the status keeps its own name in the shared map.
 */
export function ApplicationStatusBadge({ status }: { status: ApplicationStatus }) {
  const isRejection = status === "rejected" || status === "opportunityFull";
  return (
    <Tag size="sm" tone={isRejection ? "destructive" : "neutral"}>
      {isRejection ? APPLICATION_STATUS_LABELS.rejected : APPLICATION_STATUS_LABELS[status]}
    </Tag>
  );
}
