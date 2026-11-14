"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useQuery } from "convex/react";
import type { ReactNode } from "react";
import { Modal } from "@/components/modal";
import { Tag } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { disputeTitle, formatDisputeDate } from "../lib/dispute-labels";
import { DisputeStatusTag } from "./dispute-status-tag";

/** A labelled value in the summary row. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <dt className="text-body font-medium text-gray-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A dispute's details. Closed when `disputeId` is null. */
export function DisputeDetailModal({
  disputeId,
  onClose,
}: {
  disputeId: Id<"disputes"> | null;
  onClose: () => void;
}) {
  const dispute = useQuery(api.disputes.get, disputeId === null ? "skip" : { disputeId });

  return (
    <Modal
      open={disputeId !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      titleSize="lg"
      title={dispute ? disputeTitle(dispute) : <Skeleton className="h-9 w-72" />}
      className="sm:max-w-[44rem]"
    >
      {dispute === undefined ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-20 w-full" />
          <span className="sr-only" role="status">
            Loading dispute…
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <dl className="flex flex-wrap gap-x-8 gap-y-4">
            <Fact label="Company">
              <Tag size="md">{dispute.companyName}</Tag>
            </Fact>
            <Fact label="Date Created">
              <Tag size="md">{formatDisputeDate(dispute._creationTime)}</Tag>
            </Fact>
            <Fact label="Dispute Status">
              <DisputeStatusTag dispute={dispute} />
            </Fact>
          </dl>
          <Separator />
          <section aria-labelledby="dispute-description" className="flex flex-col gap-3">
            <h3 id="dispute-description" className="text-body font-medium text-gray-500">
              Dispute Description
            </h3>
            <p className="text-body-sm whitespace-pre-line text-gray-950">{dispute.description}</p>
          </section>
          {dispute.status === "resolved" && dispute.note ? (
            <section aria-labelledby="dispute-note" className="flex flex-col gap-3">
              <h3 id="dispute-note" className="text-body font-medium text-gray-500">
                Resolution Note
              </h3>
              <p className="text-body-sm whitespace-pre-line text-gray-950">{dispute.note}</p>
            </section>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
