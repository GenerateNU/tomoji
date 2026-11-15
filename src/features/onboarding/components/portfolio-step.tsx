"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { RiAddLine, RiDeleteBinLine } from "@remixicon/react";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { iconProps } from "@/lib/icons";
import { useOnboardingDraft } from "../hooks/use-onboarding-draft";
import { linkError, normalizeLink } from "../lib/validation";
import { OnboardingShell, StepHeading } from "./onboarding-shell";
import { ProfilePreview } from "./profile-preview";
import { StepActions } from "./step-actions";

/** Matches `MAX_ADDITIONAL_LINKS` in the creators schema. */
const MAX_ADDITIONAL_LINKS = 3;

type Errors = { github?: string; linkedin?: string; additional: Record<number, string> };

/** Step 4. Where companies can see the creator's work. Every field is optional. */
export function PortfolioStep({
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
  const update = useMutation(api.creators.update);
  const completeOnboarding = useMutation(api.creators.completeOnboarding);
  const [errors, setErrors] = useState<Errors>({ additional: {} });
  const [pending, setPending] = useState(false);

  function setLink(index: number, value: string) {
    setErrors((current) => ({
      ...current,
      additional: Object.fromEntries(
        Object.entries(current.additional).filter(([key]) => Number(key) !== index),
      ),
    }));
    setDraft({
      additionalLinks: draft.additionalLinks.map((link, position) =>
        position === index ? value : link,
      ),
    });
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const additional: Record<number, string> = {};
    draft.additionalLinks.forEach((link, index) => {
      // A blank extra row is simply dropped rather than reported.
      if (link.trim() === "") return;
      const message = linkError(link);
      if (message !== null) additional[index] = message;
    });
    const found: Errors = {
      github: linkError(draft.githubLink) ?? undefined,
      linkedin: linkError(draft.linkedinLink) ?? undefined,
      additional,
    };
    setErrors(found);
    if (
      found.github !== undefined ||
      found.linkedin !== undefined ||
      Object.keys(additional).length > 0
    ) {
      return;
    }

    setPending(true);
    try {
      await update({
        githubLink: normalizeLink(draft.githubLink),
        linkedinLink: normalizeLink(draft.linkedinLink),
        additionalLinks: draft.additionalLinks
          .map((link) => normalizeLink(link))
          .filter((link): link is string => link !== null),
      });
      await completeOnboarding({});
      router.push("/onboarding/ready");
    } catch {
      setErrors({ ...found, github: "We couldn't save your profile. Try again." });
      setPending(false);
    }
  }

  return (
    <OnboardingShell
      slug="portfolio"
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
          title="Where can companies find you?"
          description="We'll use this information to help companies review your portfolio."
        />

        <div className="flex flex-col gap-6">
          <TextField
            label="GitHub Profile"
            placeholder="Enter URL"
            inputMode="url"
            value={draft.githubLink}
            error={errors.github}
            onChange={(event) => {
              setDraft({ githubLink: event.target.value });
              setErrors((current) => ({ ...current, github: undefined }));
            }}
          />
          <TextField
            label="LinkedIn Profile"
            placeholder="Enter URL"
            inputMode="url"
            value={draft.linkedinLink}
            error={errors.linkedin}
            onChange={(event) => {
              setDraft({ linkedinLink: event.target.value });
              setErrors((current) => ({ ...current, linkedin: undefined }));
            }}
          />

          {draft.additionalLinks.map((link, index) => (
            <div key={index} className="flex items-start gap-3">
              <TextField
                className="flex-1"
                label={`Link ${index + 1}`}
                placeholder="Enter URL"
                inputMode="url"
                value={link}
                error={errors.additional[index]}
                onChange={(event) => setLink(index, event.target.value)}
              />
              <button
                type="button"
                aria-label={`Remove link ${index + 1}`}
                className="mt-9 shrink-0 cursor-pointer rounded-xs p-1 text-gray-500 transition-colors outline-none hover:text-gray-950 focus-visible:ring-4 focus-visible:ring-blue-primary/25"
                onClick={() =>
                  setDraft({
                    additionalLinks: draft.additionalLinks.filter(
                      (_, position) => position !== index,
                    ),
                  })
                }
              >
                <RiDeleteBinLine {...iconProps} size={18} />
              </button>
            </div>
          ))}

          {draft.additionalLinks.length < MAX_ADDITIONAL_LINKS && (
            <Button
              type="button"
              variant="primary-subtle"
              size="sm"
              icon={RiAddLine}
              className="w-fit"
              onClick={() => setDraft({ additionalLinks: [...draft.additionalLinks, ""] })}
            >
              Add link
            </Button>
          )}
        </div>

        <StepActions slug="portfolio" pending={pending} pendingLabel="Saving your profile…" />
      </form>
    </OnboardingShell>
  );
}
