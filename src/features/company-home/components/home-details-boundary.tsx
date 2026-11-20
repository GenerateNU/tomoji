"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";

/** Keeps a detail-query failure inside its modal, with a fresh read on retry. */
export function DetailsBoundary({
  title,
  children,
  onClose,
  finalFocus,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  finalFocus?: ComponentProps<typeof Modal>["finalFocus"];
}) {
  const [attempt, setAttempt] = useState(0);
  return (
    <ErrorBoundary
      key={attempt}
      fallback={() => (
        <Modal
          open
          title={title}
          finalFocus={finalFocus}
          onOpenChange={(open) => {
            if (!open) onClose();
          }}
        >
          <div role="alert" className="space-y-4">
            <p>Couldn’t load these details. Try again.</p>
            <Button onClick={() => setAttempt(attempt + 1)}>Try again</Button>
          </div>
        </Modal>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
