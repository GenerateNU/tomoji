"use client";

import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";

/** Thanks the creator once a dispute is filed and says what happens next. */
export function DisputeSubmittedModal({
  open,
  onDismiss,
}: {
  open: boolean;
  onDismiss: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
      title="Thank you for submitting a dispute"
      className="sm:max-w-[28rem]"
      footer={
        <Button size="sm" onClick={onDismiss}>
          Dismiss
        </Button>
      }
    >
      <p className="text-body-sm text-gray-700">
        We&apos;re sorry to hear you&apos;re experiencing issues. The Ohani team will be in contact
        with you.
      </p>
    </Modal>
  );
}
