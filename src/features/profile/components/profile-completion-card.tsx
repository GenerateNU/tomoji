"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { useRef, useState } from "react";
import { ProgressRing } from "@/components/progress-ring";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfileDialog } from "./profile-dialog";

/**
 * The home page's nudge to finish the profile. It opens the profile pop-up
 * straight in the editor, and disappears once every item is filled.
 */
export function ProfileCompletionCard() {
  const completion = useQuery(api.creators.completion, {});
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  if (completion === undefined) {
    return (
      <div className="flex flex-col gap-4 rounded-lg bg-gray-0 p-6 shadow-card">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-11 w-40" />
      </div>
    );
  }
  // Hide a finished card only once the editor is closed. X linking saves on its
  // own, so completion can reach 100% mid-edit; unmounting then would close the
  // dialog and drop the unsaved draft.
  if (completion.percent >= 100 && !open) return null;

  return (
    <section
      aria-labelledby="profile-completion-heading"
      className="flex flex-col items-start gap-4 rounded-lg bg-gray-0 p-6 shadow-card"
    >
      <ProgressRing value={completion.percent} size="md" label="Profile completion" />
      <div className="flex flex-col gap-1">
        <h2 id="profile-completion-heading" className="text-body-lg font-medium text-gray-950">
          Complete your profile
        </h2>
        <p className="text-body-sm text-gray-500">
          Your profile is {completion.percent}% complete. Finish creating your profile and get
          companies to see your full potential.
        </p>
      </div>
      <Button ref={trigger} variant="primary-subtle" onClick={() => setOpen(true)}>
        Complete my profile
      </Button>
      <ProfileDialog open={open} onOpenChange={setOpen} finalFocus={trigger} startEditing />
    </section>
  );
}
