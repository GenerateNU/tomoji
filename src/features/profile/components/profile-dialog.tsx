"use client";

import { useRef, useState, type RefObject } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/errors";
import { ProfileContent } from "./profile-content";

export function ProfileDialog({
  open,
  onOpenChange,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  finalFocus?: RefObject<HTMLElement | null>;
}) {
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const titleRef = useRef<HTMLHeadingElement>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!pending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="flex min-h-0 flex-col gap-0 overflow-hidden"
        initialFocus={titleRef}
        finalFocus={finalFocus}
        showCloseButton={!pending}
      >
        <DialogTitle ref={titleRef} tabIndex={-1} className="sr-only">
          Your profile
        </DialogTitle>
        {open && (
          <ErrorBoundary
            key={attempt}
            fallback={(error) => (
              <div className="space-y-4 p-8">
                <p role="alert" className="text-body text-gray-700">
                  {errorMessage(error, {
                    not_found: "Your profile is not available yet. Try again shortly.",
                  })}
                </p>
                <Button
                  type="button"
                  variant="secondary-subtle"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  Retry profile
                </Button>
              </div>
            )}
          >
            <ProfileContent onPendingChange={setPending} />
          </ErrorBoundary>
        )}
      </DialogContent>
    </Dialog>
  );
}
