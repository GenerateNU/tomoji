"use client";

import type { Id } from "@convex/_generated/dataModel";
import { ErrorBoundary } from "@/components/error-boundary";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { errorMessage } from "@/lib/errors";
import { ApplicationFlow } from "./application-flow";

type ApplicationModalProps = {
  opportunityId: Id<"opportunities">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** The dialog a creator applies through. */
export function ApplicationModal({ opportunityId, open, onOpenChange }: ApplicationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto p-10 sm:max-w-2xl">
        {/*If a creator shuts and opens it it goes back to the start - is this the desired behavior? */}
        {/* The key is on the boundary: unmounting is what clears a caught error,
            so reopening or switching opportunities retries the read. */}
        {open && (
          <ErrorBoundary
            key={opportunityId}
            fallback={(error) => (
              <DialogTitle>
                {errorMessage(error, {
                  not_found: "This opportunity is no longer available.",
                })}
              </DialogTitle>
            )}
          >
            <ApplicationFlow opportunityId={opportunityId} />
          </ErrorBoundary>
        )}
      </DialogContent>
    </Dialog>
  );
}
