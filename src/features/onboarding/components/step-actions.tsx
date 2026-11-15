"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { previousPath, type OnboardingSlug } from "../lib/steps";

/** The Back and Continue pair every step after the first one ends with. */
export function StepActions({
  slug,
  pending,
  pendingLabel = "Saving…",
}: {
  slug: OnboardingSlug;
  pending: boolean;
  /** Replaces "Continue" while the step saves. */
  pendingLabel?: string;
}) {
  const router = useRouter();
  const back = previousPath(slug);
  return (
    <div className="flex flex-wrap gap-3">
      {back !== null && (
        <Button
          type="button"
          variant="secondary-subtle"
          className="min-w-30"
          disabled={pending}
          onClick={() => router.push(back)}
        >
          Back
        </Button>
      )}
      <Button type="submit" className="min-w-30" disabled={pending} aria-busy={pending}>
        {pending ? pendingLabel : "Continue"}
      </Button>
    </div>
  );
}
