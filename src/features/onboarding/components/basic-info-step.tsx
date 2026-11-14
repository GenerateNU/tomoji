"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { MultiSelectField } from "@/components/multi-select-field";
import { SelectField } from "@/components/select-field";
import { TextField } from "@/components/text-field";
import { useOnboardingDraft } from "../hooks/use-onboarding-draft";
import { nextPath } from "../lib/steps";
import { birthdateError, parseBirthdate, selectionError, requiredError } from "../lib/validation";
import { OnboardingPicture } from "./onboarding-picture";
import { OnboardingShell, StepHeading } from "./onboarding-shell";
import { ProfilePreview } from "./profile-preview";
import { StepActions } from "./step-actions";

type Errors = { birthdate?: string; country?: string; languages?: string };

/** Step 2. Date of birth, country, and the languages the creator posts in. */
export function BasicInfoStep({
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
  const countries = useQuery(api.countries.list, {});
  const languages = useQuery(api.languages.list, {});
  const update = useMutation(api.creators.update);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, setPending] = useState(false);
  const [pictureUrl, setPictureUrl] = useState<string>();

  // Correcting a field clears its own message, so a fixed field stops looking wrong.
  function clear(field: keyof Errors) {
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found: Errors = {
      birthdate: birthdateError(draft.birthdate) ?? undefined,
      country: requiredError(draft.countryOfResidence, "Country required") ?? undefined,
      languages: selectionError(draft.languages, "Select at least one language") ?? undefined,
    };
    setErrors(found);
    if (Object.values(found).some((message) => message !== undefined)) return;

    setPending(true);
    try {
      await update({
        dateOfBirth: parseBirthdate(draft.birthdate) ?? undefined,
        countryOfResidence: draft.countryOfResidence,
        languages: draft.languages,
      });
      router.push(nextPath("basic-info"));
    } catch {
      setErrors({ birthdate: "We couldn't save that. Check the date and try again." });
      setPending(false);
    }
  }

  return (
    <OnboardingShell
      slug="basic-info"
      asideClassName="bg-blue-subtle/40"
      aside={
        <ProfilePreview
          name={name}
          joinedAt={joinedAt}
          xUsername={xUsername}
          pictureMediaId={pictureMediaId}
          pictureUrl={pictureUrl}
        />
      }
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-8">
        <StepHeading title="Let's get to know you" description="Get started with your profile." />

        <OnboardingPicture name={name} mediaId={pictureMediaId} onPreviewChange={setPictureUrl} />

        <div className="flex flex-col gap-6">
          <TextField
            label="Date of birth"
            placeholder="MM/DD/YYYY"
            inputMode="numeric"
            autoComplete="bday"
            value={draft.birthdate}
            error={errors.birthdate}
            onChange={(event) => {
              setDraft({ birthdate: event.target.value });
              clear("birthdate");
            }}
          />
          <SelectField
            label="Country of residence"
            placeholder="Select country"
            options={(countries ?? []).map((entry) => ({
              value: entry.code,
              label: entry.name,
            }))}
            value={draft.countryOfResidence || null}
            error={errors.country}
            disabled={countries === undefined}
            onValueChange={(value) => {
              setDraft({ countryOfResidence: value ?? "" });
              clear("country");
            }}
          />
          <MultiSelectField
            label="Languages"
            placeholder="Select one or more languages"
            searchPlaceholder="Search languages"
            options={(languages ?? []).map((entry) => ({
              value: entry.name,
              label: entry.label,
            }))}
            value={draft.languages}
            error={errors.languages}
            disabled={languages === undefined}
            onValueChange={(value) => {
              setDraft({ languages: value });
              clear("languages");
            }}
          />
        </div>

        <StepActions slug="basic-info" pending={pending} />
      </form>
    </OnboardingShell>
  );
}
