import { Tag } from "@/components/ui/badge";
import { disputeStatus, type DisputeView } from "../lib/dispute-labels";

/** The dispute's status as a tag. */
export function DisputeStatusTag({ dispute }: { dispute: DisputeView }) {
  const { label, icon } = disputeStatus(dispute);
  return (
    <Tag size="md" icon={icon}>
      {label}
    </Tag>
  );
}
