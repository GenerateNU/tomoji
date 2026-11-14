"use client";

import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";

type FinalFocus = React.ComponentProps<typeof Modal>["finalFocus"];

export function OfferAcceptedModal({
  open,
  deliverableCount,
  onDismiss,
  onGoToAssignments,
  finalFocus,
}: {
  open: boolean;
  /** How many assignments the accepted offer created. */
  deliverableCount: number;
  onDismiss: () => void;
  onGoToAssignments: () => void;
  /** Where focus goes on close; the default is the element that opened the modal. */
  finalFocus?: FinalFocus;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
      title={
        deliverableCount === 1
          ? "You have 1 new assignment!"
          : `You have ${deliverableCount} new assignments!`
      }
      titleSize="lg"
      className="sm:max-w-[760px]"
      finalFocus={finalFocus}
      footer={
        <>
          <Button className="max-sm:flex-1" variant="secondary-subtle" onClick={onDismiss}>
            Dismiss
          </Button>
          <Button className="max-sm:flex-1" autoFocus onClick={onGoToAssignments}>
            Go to assignments
          </Button>
        </>
      }
    >
      <p className="text-body text-gray-700">
        Go to your assignments portal to view the video guidelines, information, and start filming
      </p>
    </Modal>
  );
}
