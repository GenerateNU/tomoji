"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { RiAddLine, RiDeleteBinLine } from "@remixicon/react";
import { api } from "@convex/_generated/api";
import { MAX_ADDITIONAL_LINKS } from "@convex/schemas/creators.schema";
import { COUNTRIES } from "@convex/models/countries";
import { LANGUAGES, MAX_LANGUAGES } from "@convex/models/languages";
import { MAX_NICHES, NICHES } from "@convex/models/niches";
import { SKILLS } from "@convex/models/skills";
import { MultiSelectField } from "@/components/multi-select-field";
import { SelectField } from "@/components/select-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";
import { parseBirthdate, toDateInputValue } from "../lib/birthdate";
import { parseGithubLink } from "../lib/github-link";
import { parseAdditionalLinks, parseLinkedinLink } from "../lib/links";
import { PREVIEW_CONTENT_TYPES } from "../lib/profile-preview";
import { CreatorProfileHeader } from "./creator-profile-header";

function sameValues(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function CreatorProfileForm({
  profile,
  previewContentTypes,
  onCancel,
  onSaved,
  onPendingChange,
}: {
  profile: FunctionReturnType<typeof api.creators.me>;
  previewContentTypes: string[];
  onCancel: () => void;
  onSaved: (contentTypes: string[], persisted: boolean) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const id = useId();
  // A subscription update must not replace an in-progress draft or its comparison baseline.
  const [initial] = useState(profile);
  const [contentTypes, setContentTypes] = useState(previewContentTypes);
  const [birthdate, setBirthdate] = useState(() => toDateInputValue(profile.dateOfBirth));
  const [country, setCountry] = useState(profile.countryOfResidence ?? "");
  const [languages, setLanguages] = useState(profile.languages);
  const [niches, setNiches] = useState(profile.niches);
  const [skills, setSkills] = useState(profile.skills);
  const [github, setGithub] = useState(profile.githubLink ?? "");
  const [linkedin, setLinkedin] = useState(profile.linkedinLink ?? "");
  const [links, setLinks] = useState(profile.additionalLinks);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveError, setSaveError] = useState("");
  const [pending, setPending] = useState(false);
  const [today] = useState(() => toDateInputValue(Date.now()));
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const focusInvalidField = useRef(false);
  const update = useMutation(api.creators.update);

  useEffect(() => {
    if (!focusInvalidField.current) return;
    focusInvalidField.current = false;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [errors]);

  const profileUnchanged =
    birthdate === toDateInputValue(initial.dateOfBirth) &&
    country === (initial.countryOfResidence ?? "") &&
    sameValues(languages, initial.languages) &&
    sameValues(niches, initial.niches) &&
    sameValues(skills, initial.skills) &&
    github === (initial.githubLink ?? "") &&
    linkedin === (initial.linkedinLink ?? "") &&
    sameValues(links, initial.additionalLinks);
  const unchanged = profileUnchanged && sameValues(contentTypes, previewContentTypes);

  function clearError(field: string) {
    setErrors((current) => ({ ...current, [field]: "" }));
    setSaveError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || unchanged) return;
    if (profileUnchanged) {
      onSaved(contentTypes, false);
      return;
    }
    const birthdateResult = parseBirthdate(birthdate);
    const githubResult = parseGithubLink(github);
    const linkedinResult = parseLinkedinLink(linkedin);
    const linksResult = parseAdditionalLinks(links);
    const invalid: Record<string, string> = {};
    if (!birthdateResult.ok) invalid.dateOfBirth = birthdateResult.error;
    else if (birthdateResult.value === null && initial.dateOfBirth !== undefined)
      invalid.dateOfBirth = "Your date of birth can't be removed, only corrected.";
    if (!githubResult.ok) invalid.github = githubResult.error;
    if (!linkedinResult.ok) invalid.linkedin = linkedinResult.error;
    if (!linksResult.ok) invalid[`link-${linksResult.index ?? 0}`] = linksResult.error;
    if (languages.length > MAX_LANGUAGES)
      invalid.languages = `Choose up to ${MAX_LANGUAGES} languages.`;
    if (niches.length > MAX_NICHES) invalid.niches = `Choose up to ${MAX_NICHES} niches.`;
    setErrors(invalid);
    if (Object.keys(invalid).length > 0) {
      focusInvalidField.current = true;
      return;
    }
    if (!birthdateResult.ok || !githubResult.ok || !linkedinResult.ok || !linksResult.ok) return;

    // Patch just the edited fields, preserving unrelated updates from other sessions.
    const changes: FunctionArgs<typeof api.creators.update> = {};
    if (birthdateResult.value !== null && birthdateResult.value !== initial.dateOfBirth)
      changes.dateOfBirth = birthdateResult.value;
    if (country !== (initial.countryOfResidence ?? ""))
      changes.countryOfResidence = country || null;
    if (!sameValues(languages, initial.languages)) changes.languages = languages;
    if (!sameValues(niches, initial.niches)) changes.niches = niches;
    if (!sameValues(skills, initial.skills)) changes.skills = skills;
    if (github !== (initial.githubLink ?? "")) changes.githubLink = githubResult.value;
    if (linkedin !== (initial.linkedinLink ?? "")) changes.linkedinLink = linkedinResult.value;
    if (!sameValues(links, initial.additionalLinks)) changes.additionalLinks = linksResult.value;

    submitting.current = true;
    setPending(true);
    onPendingChange?.(true);
    setSaveError("");
    try {
      await update(changes);
      onSaved(contentTypes, true);
    } catch (error) {
      setSaveError(
        errorMessage(error, { invalid_state: "Check your profile details and try again." }),
      );
    } finally {
      submitting.current = false;
      setPending(false);
      onPendingChange?.(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={save}
      noValidate
      className="flex max-h-[calc(100dvh-4rem)] min-h-0 flex-col sm:max-h-[min(38rem,calc(100dvh-4rem))]"
    >
      <CreatorProfileHeader profile={initial} editing />
      <div className="min-h-0 space-y-8 overflow-y-auto px-6 py-6 sm:px-8">
        <section aria-labelledby={`${id}-basic`} className="space-y-4">
          <h3 id={`${id}-basic`} className="font-heading text-body-lg font-medium">
            Basic info
          </h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="group space-y-2">
              <Label htmlFor={`${id}-birthdate`}>Date of birth</Label>
              <Input
                id={`${id}-birthdate`}
                name="dateOfBirth"
                type="date"
                value={birthdate}
                max={today}
                autoFocus
                disabled={pending}
                aria-invalid={!!errors.dateOfBirth}
                aria-describedby={errors.dateOfBirth ? `${id}-birthdate-message` : undefined}
                onChange={(event) => {
                  setBirthdate(event.target.value);
                  clearError("dateOfBirth");
                }}
              />
              {errors.dateOfBirth && (
                <p
                  id={`${id}-birthdate-message`}
                  role="alert"
                  className="text-body-sm text-red-700"
                >
                  {errors.dateOfBirth}
                </p>
              )}
            </div>
            <SelectField
              label="Country of residence"
              value={country}
              options={[
                { value: "", label: "Not selected" },
                ...COUNTRIES.map((entry) => ({ value: entry.code, label: entry.name })),
              ]}
              disabled={pending}
              placeholder="Select country"
              onValueChange={(value) => {
                setCountry(value ?? "");
                setSaveError("");
              }}
            />
            <MultiSelectField
              label="Languages"
              value={languages}
              options={LANGUAGES.map((option) => ({
                value: option.name,
                label: option.label,
              }))}
              placeholder="Select languages"
              disabled={pending}
              error={errors.languages}
              onValueChange={(value) => {
                setLanguages(value);
                clearError("languages");
              }}
            />
          </div>
        </section>
        <section aria-labelledby={`${id}-content`} className="space-y-4">
          <h3 id={`${id}-content`} className="font-heading text-body-lg font-medium">
            Content
          </h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <MultiSelectField
              label="Niches"
              value={niches}
              maxVisibleTags={1}
              options={NICHES.map((option) => ({
                value: option.name,
                label: option.label,
              }))}
              placeholder="Select niches"
              disabled={pending}
              error={errors.niches}
              onValueChange={(value) => {
                setNiches(value);
                clearError("niches");
              }}
            />
            <MultiSelectField
              label="Skills"
              value={skills}
              options={SKILLS.map((option) => ({
                value: option.name,
                label: option.label,
              }))}
              placeholder="Select skills"
              disabled={pending}
              onValueChange={(value) => {
                setSkills(value);
                setSaveError("");
              }}
            />
            <MultiSelectField
              label="Content type"
              value={contentTypes}
              options={[...PREVIEW_CONTENT_TYPES]}
              placeholder="Select content types"
              disabled={pending}
              onValueChange={setContentTypes}
            />
          </div>
        </section>
        <section aria-labelledby={`${id}-portfolio`} className="space-y-4">
          <h3 id={`${id}-portfolio`} className="font-heading text-body-lg font-medium">
            Portfolio
          </h3>
          <Button type="button" variant="secondary-subtle" size="sm" disabled>
            {profile.xId ? "X account linked" : "Link X"}
          </Button>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="group space-y-2">
              <Label htmlFor={`${id}-github`}>GitHub profile</Label>
              <Input
                id={`${id}-github`}
                name="github"
                type="url"
                value={github}
                disabled={pending}
                placeholder="https://github.com/username"
                aria-invalid={!!errors.github}
                aria-describedby={errors.github ? `${id}-github-error` : undefined}
                onChange={(event) => {
                  setGithub(event.target.value);
                  clearError("github");
                }}
              />
              {errors.github && (
                <p id={`${id}-github-error`} role="alert" className="text-body-sm text-red-700">
                  {errors.github}
                </p>
              )}
            </div>
            <div className="group space-y-2">
              <Label htmlFor={`${id}-linkedin`}>LinkedIn profile</Label>
              <Input
                id={`${id}-linkedin`}
                name="linkedin"
                type="url"
                value={linkedin}
                disabled={pending}
                placeholder="https://linkedin.com/in/username"
                aria-invalid={!!errors.linkedin}
                aria-describedby={errors.linkedin ? `${id}-linkedin-error` : undefined}
                onChange={(event) => {
                  setLinkedin(event.target.value);
                  clearError("linkedin");
                }}
              />
              {errors.linkedin && (
                <p id={`${id}-linkedin-error`} role="alert" className="text-body-sm text-red-700">
                  {errors.linkedin}
                </p>
              )}
            </div>
          </div>
          {links.map((value, index) => (
            <div key={index} className="group space-y-2 sm:w-[calc(50%-0.625rem)]">
              <Label htmlFor={`${id}-link-${index}`}>Link {index + 1}</Label>
              <div className="flex items-start gap-2">
                <Input
                  id={`${id}-link-${index}`}
                  name={`link-${index}`}
                  type="url"
                  value={value}
                  disabled={pending}
                  placeholder="https://example.com"
                  aria-invalid={!!errors[`link-${index}`]}
                  aria-describedby={
                    errors[`link-${index}`] ? `${id}-link-${index}-error` : undefined
                  }
                  onChange={(event) => {
                    setLinks((current) =>
                      current.map((link, item) => (item === index ? event.target.value : link)),
                    );
                    clearError(`link-${index}`);
                  }}
                />
                <Button
                  type="button"
                  variant="secondary-ghost"
                  size="icon"
                  icon={RiDeleteBinLine}
                  aria-label={`Remove link ${index + 1}`}
                  disabled={pending}
                  onClick={() => {
                    setLinks((current) => current.filter((_, item) => item !== index));
                    setErrors({});
                    setSaveError("");
                  }}
                />
              </div>
              {errors[`link-${index}`] && (
                <p
                  id={`${id}-link-${index}-error`}
                  role="alert"
                  className="text-body-sm text-red-700"
                >
                  {errors[`link-${index}`]}
                </p>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="primary-subtle"
            size="sm"
            icon={RiAddLine}
            disabled={pending || links.length >= MAX_ADDITIONAL_LINKS}
            onClick={() => setLinks((current) => [...current, ""])}
          >
            Add link
          </Button>
        </section>
      </div>
      <footer className="shrink-0 space-y-3 bg-gray-0 px-6 pt-3 pb-6 sm:px-8 sm:pb-8">
        {saveError && (
          <p role="alert" className="text-body-sm text-red-700">
            {saveError}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button type="button" variant="secondary-subtle" disabled={pending} onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || unchanged}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </footer>
    </form>
  );
}
