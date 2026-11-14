"use client";

import { Modal } from "@/components/modal";
import { Spinner } from "@/components/spinner";
import { Button } from "@/components/ui/button";

type FinalFocus = React.ComponentProps<typeof Modal>["finalFocus"];

export function DeclineOfferModal({
  open,
  companyName,
  pending,
  onCancel,
  onConfirm,
  finalFocus,
}: {
  open: boolean;
  companyName: string;
  /** The decline is in flight; the modal can't be closed until it settles. */
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  finalFocus: FinalFocus;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onCancel();
      }}
      title="Are you sure you want to reject this offer?"
      className="sm:max-w-[760px]"
      finalFocus={finalFocus}
      footer={
        <>
          <Button
            className="max-sm:flex-1"
            variant="secondary-subtle"
            autoFocus
            disabled={pending}
            onClick={onCancel}
          >
            Go back
          </Button>
          <Button className="max-sm:flex-1" disabled={pending} onClick={onConfirm}>
            {pending && <Spinner size={16} label="Working" className="text-current" />}
            Confirm
          </Button>
        </>
      }
    >
      <p className="text-body text-gray-700">
        By confirming you will not be able to accept this offer from {companyName || "this company"}{" "}
        and will not be able to participate in the job.
      </p>
    </Modal>
  );
}
