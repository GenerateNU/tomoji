"use client";

import type { ComponentProps } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";

/**
 * A short yes/no question before a lifecycle change. It stays open while the
 * change is saving and shows a failure inline, so it can be retried.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Yes",
  confirmVariant = "primary",
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmVariant?: ComponentProps<typeof Button>["variant"];
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={title}
      className="sm:max-w-md"
      footer={
        <>
          <Button variant="secondary-ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={pending}>
            {pending ? "Saving…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-body-sm text-gray-500">{description}</p>
        {error && (
          <p role="alert" className="text-body-sm text-red-600">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
