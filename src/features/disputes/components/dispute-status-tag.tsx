import { Tag } from "@/components/ui/badge";
import { disputeStatus, type DisputeView } from "../lib/dispute-labels";

/** "Under Review" while open; Approved, Denied or Withdrawn once resolved. */
export function DisputeStatusTag({
  dispute,
  size = "md",
}: {
  dispute: DisputeView;
  size?: "sm" | "md";
}) {
  const { label, icon } = disputeStatus(dispute);
  return (
    <Tag size={size} icon={icon}>
      {label}
    </Tag>
  );
}
