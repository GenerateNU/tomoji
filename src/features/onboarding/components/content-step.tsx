"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { MultiSelectField } from "@/components/multi-select-field";
import { useOnboardingDraft } from "../hooks/use-onboarding-draft";
import { nextPath } from "../lib/steps";
import { selectionError } from "../lib/validation";
import { OnboardingShell, StepHeading } from "./onboarding-shell";
import { ProfilePreview } from "./profile-preview";
import { StepActions } from "./step-actions";

type Errors = { niches?: string; skills?: string };

/** Step 3. The niches and skills companies match briefs against. */
export function ContentStep({
  name,
  joinedAt,
  xUsername,
  pictureMediaId,
}: {
  name: string;
  joinedAt: number;
  xUsername: string | null;
  pictureMediaId?: Id<"mediaUploads">;
}) {
  const router = useRouter();
  const { draft, setDraft } = useOnboardingDraft();
  const niches = useQuery(api.niches.list, {});
  const skills = useQuery(api.skills.list, {});
  const update = useMutation(api.creators.update);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);

  // Correcting a field clears its own message, so a fixed field stops looking wrong.
  function clear(field: keyof Errors) {
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found: Errors = {
      niches: selectionError(draft.niches, "Select at least one niche") ?? undefined,
      skills: selectionError(draft.skills, "Select at least one skill") ?? undefined,
    };
    setErrors(found);
    if (Object.values(found).some((message) => message !== undefined)) return;

    setPending(true);
    try {
      await update({ niches: draft.niches, skills: draft.skills });
      router.push(nextPath("content"));
    } catch {
      setErrors({ niches: "We couldn't save those. Try again." });
      setPending(false);
    }
  }

  return (
    <OnboardingShell
      slug="content"
      asideClassName="bg-blue-subtle/40"
      aside={
        <ProfilePreview
          name={name}
          joinedAt={joinedAt}
          xUsername={xUsername}
          pictureMediaId={pictureMediaId}
        />
      }
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-8">
        <StepHeading
          title="What content do you make?"
          description="We'll use this information to help you connect with the right companies."
        />

        <div className="flex flex-col gap-6">
          <MultiSelectField
            label="Niches"
            placeholder="Select one or more niches"
            searchPlaceholder="Search niches"
            options={(niches ?? []).map((entry) => ({ value: entry.name, label: entry.label }))}
            value={draft.niches}
            error={errors.niches}
            disabled={niches === undefined}
            onValueChange={(value) => {
              setDraft({ niches: value });
              clear("niches");
            }}
          />
          <MultiSelectField
            label="Skills"
            placeholder="Select one or more skills"
            searchPlaceholder="Search skills"
            options={(skills ?? []).map((entry) => ({ value: entry.name, label: entry.label }))}
            value={draft.skills}
            error={errors.skills}
            disabled={skills === undefined}
            onValueChange={(value) => {
              setDraft({ skills: value });
              clear("skills");
            }}
          />
        </div>

        <StepActions slug="content" pending={pending} />
      </form>
    </OnboardingShell>
  );
}
