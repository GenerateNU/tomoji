"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { errorCode } from "@/lib/errors";

type ModalLoadBoundaryProps = {
  /** What the modal shows, in lowercase, e.g. "offer": "Offer unavailable". */
  noun: string;
  /** Changes with the item shown, so a failed read doesn't follow to the next one. */
  itemKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus?: ComponentProps<typeof Modal>["finalFocus"];
  overlayClassName?: string;
  children: ReactNode;
};

/**
 * Wraps a modal that reads one item by ID. If the read fails, the same dialog
 * says why: an item that's gone or not the viewer's ("not found") is final,
 * and any other failure offers Try again, which remounts the children.
 */
export function ModalLoadBoundary({
  noun,
  itemKey,
  open,
  onOpenChange,
  finalFocus,
  overlayClassName,
  children,
}: ModalLoadBoundaryProps) {
  const [attempt, setAttempt] = useState(0);
  return (
    <ErrorBoundary
      key={`${itemKey}:${attempt}`}
      fallback={(error) => {
        const notFound = errorCode(error) === "not_found";
        return (
          <Modal
            open={open}
            onOpenChange={onOpenChange}
            finalFocus={finalFocus}
            overlayClassName={overlayClassName}
            title={`${noun.charAt(0).toUpperCase()}${noun.slice(1)} unavailable`}
            footer={
              notFound ? undefined : (
                <Button onClick={() => setAttempt((value) => value + 1)}>Try again</Button>
              )
            }
          >
            <p className="text-body text-gray-700">
              {notFound ? `This ${noun} is no longer available.` : `We couldn’t load this ${noun}.`}
            </p>
          </Modal>
        );
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
