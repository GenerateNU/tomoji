"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/modal";
import { SelectField } from "@/components/select-field";
import { TextAreaField } from "@/components/text-area-field";
import { Tag } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { DisputeStatusTag } from "@/features/disputes/components/dispute-status-tag";
import { disputeTitle, formatDisputeDate } from "@/features/disputes/lib/dispute-labels";
import { errorMessage, errorReason } from "@/lib/errors";

type Outcome = "approved" | "denied";

const OUTCOMES = [
  { value: "approved", label: "Approved — in the opener's favor" },
  { value: "denied", label: "Denied" },
];

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <dt className="text-body font-medium text-gray-500">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const RULING_ERRORS: Record<string, string> = {
  dispute_not_resolved: "This dispute is still open, so there is no result to override.",
  operator_ruling_final: "Ohani already ruled on this one. That ruling is final.",
  dispute_withdrawn: "The opener withdrew this dispute, so there is no result to overrule.",
  dispute_already_resolved: "Someone closed this dispute while you had it open.",
};

/**
 * A dispute as Ohani sees it, with the ruling controls. An open dispute can be
 * closed; a dispute the two sides already closed can be overridden, which keeps
 * their result on the record as `overriddenResolution`.
 */
export function OperatorDisputeModal({
  disputeId,
  onClose,
}: {
  disputeId: Id<"disputes"> | null;
  onClose: () => void;
}) {
  const dispute = useQuery(api.disputes.get, disputeId === null ? "skip" : { disputeId });
  const resolve = useMutation(api.disputes.resolve);
  const override = useMutation(api.disputes.override);

  const [outcome, setOutcome] = useState<Outcome>("approved");
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const open = dispute?.status === "open";
  // Ohani's own rulings are final, and a withdrawal has no result to overrule.
  const overridable =
    dispute?.status === "resolved" &&
    dispute.resolvedByRole !== "operator" &&
    dispute.outcome !== "withdrawn";
  const canRule = open || overridable;

  function reset() {
    setOutcome("approved");
    setNote("");
    setNoteError(null);
  }

  function close() {
    if (pending) return;
    onClose();
    reset();
  }

  async function submit() {
    if (disputeId === null || pending) return;
    const trimmed = note.trim();
    if (overridable && trimmed === "") {
      setNoteError("Say why you're changing the result.");
      return;
    }
    setPending(true);
    setNoteError(null);
    try {
      if (open) {
        await resolve({ disputeId, outcome, note: trimmed || undefined });
        toast.success(`Dispute closed as ${outcome}.`);
      } else {
        await override({ disputeId, outcome, note: trimmed });
        toast.success(`Result changed to ${outcome}.`);
      }
      onClose();
      reset();
    } catch (error) {
      const reason = errorReason(error);
      toast.error(
        (reason && RULING_ERRORS[reason]) ??
          errorMessage(error, { forbidden: "This dispute isn't yours to rule on." }),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={disputeId !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      titleSize="lg"
      title={dispute ? disputeTitle(dispute) : <Skeleton className="h-9 w-72" />}
      titleAddon={dispute ? <DisputeStatusTag dispute={dispute} /> : null}
      className="sm:max-w-[44rem]"
      footer={
        canRule && (
          <>
            <Button variant="secondary-subtle" disabled={pending} onClick={close}>
              Cancel
            </Button>
            <Button disabled={pending} onClick={() => void submit()}>
              {pending ? "Saving…" : open ? "Close dispute" : "Override result"}
            </Button>
          </>
        )
      }
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
            <Fact label="Opened by">
              <Tag size="md">
                {dispute.openedByRole === "creator"
                  ? "Creator"
                  : dispute.openedByRole === "company"
                    ? "Company"
                    : "Ohani"}
              </Tag>
            </Fact>
            <Fact label="Date created">
              <Tag size="md">{formatDisputeDate(dispute._creationTime)}</Tag>
            </Fact>
          </dl>
          <Separator />
          <section className="flex flex-col gap-3">
            <h3 className="text-body font-medium text-gray-500">Dispute description</h3>
            <p className="text-body-sm whitespace-pre-line text-gray-950">{dispute.description}</p>
          </section>

          {dispute.status === "resolved" && dispute.note && (
            <section className="flex flex-col gap-3">
              <h3 className="text-body font-medium text-gray-500">Resolution note</h3>
              <p className="text-body-sm whitespace-pre-line text-gray-950">{dispute.note}</p>
            </section>
          )}

          {dispute.status === "resolved" && dispute.overriddenResolution && (
            <section className="flex flex-col gap-2 rounded bg-gray-25 p-4">
              <h3 className="text-body font-medium text-gray-500">Original result</h3>
              <p className="text-body-sm text-gray-950">
                Closed as {dispute.overriddenResolution.outcome} by the{" "}
                {dispute.overriddenResolution.resolvedByRole} on{" "}
                {formatDisputeDate(dispute.overriddenResolution.resolvedAt)}.
              </p>
            </section>
          )}

          {canRule && (
            <>
              <Separator />
              <section className="flex flex-col gap-4">
                <h3 className="text-body font-medium text-gray-950">
                  {open ? "Close this dispute" : "Override the result"}
                </h3>
                <p className="text-body-sm text-gray-500">
                  {open
                    ? "Record the result the two sides settled on. Closing is final, though Ohani can still override it afterwards."
                    : "Ohani's ruling replaces the result the two sides reported. The original stays on the record."}
                </p>
                <SelectField
                  label="Result"
                  options={OUTCOMES}
                  value={outcome}
                  onValueChange={(value) => setOutcome(value === "denied" ? "denied" : "approved")}
                />
                <TextAreaField
                  label="Note"
                  required={overridable}
                  rows={4}
                  placeholder={
                    overridable ? "Why the result is changing." : "Optional context for both sides."
                  }
                  value={note}
                  error={noteError ?? undefined}
                  onChange={(event) => {
                    setNote(event.target.value);
                    setNoteError(null);
                  }}
                />
              </section>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
