"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { MAX_ADDITIONAL_LINKS } from "@convex/schemas/creators.schema";
import { LoaderCircle, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";
import { parseAdditionalLinks, parseLinkedinLink } from "../lib/links";

export function LinksForm({
  linkedinLink,
  additionalLinks,
  onDiscard,
  onSaved,
}: {
  linkedinLink: string;
  additionalLinks: string[];
  onDiscard: () => void;
  onSaved: () => void;
}) {
  const id = useId();
  const linkedinRef = useRef<HTMLInputElement>(null);
  const additionalRefs = useRef<(HTMLInputElement | null)[]>([]);
  const submitting = useRef(false);
  const [linkedin, setLinkedin] = useState(linkedinLink);
  const [additional, setAdditional] = useState(additionalLinks);
  const [pending, setPending] = useState(false);
  const [linkedinError, setLinkedinError] = useState("");
  const [additionalError, setAdditionalError] = useState<{ index: number | null; message: string }>(
    { index: null, message: "" },
  );
  const [saveError, setSaveError] = useState("");
  const update = useMutation(api.creators.update);

  const unchanged =
    linkedin === linkedinLink &&
    additional.length === additionalLinks.length &&
    additional.every((link, index) => link === additionalLinks[index]);

  function clearErrors() {
    setLinkedinError("");
    setAdditionalError({ index: null, message: "" });
    setSaveError("");
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const parsedLinkedin = parseLinkedinLink(linkedin);
    if (!parsedLinkedin.ok) {
      setLinkedinError(parsedLinkedin.error);
      linkedinRef.current?.focus();
      return;
    }
    const parsedAdditional = parseAdditionalLinks(additional);
    if (!parsedAdditional.ok) {
      setAdditionalError({ index: parsedAdditional.index, message: parsedAdditional.error });
      if (parsedAdditional.index !== null) {
        additionalRefs.current[parsedAdditional.index]?.focus();
      }
      return;
    }
    submitting.current = true;
    setPending(true);
    setSaveError("");
    try {
      await update({
        linkedinLink: parsedLinkedin.value,
        additionalLinks: parsedAdditional.value,
      });
      onSaved();
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor={`${id}-linkedin`}>LinkedIn profile URL</Label>
        <Input
          ref={linkedinRef}
          id={`${id}-linkedin`}
          name="linkedinLink"
          type="url"
          inputMode="url"
          autoComplete="url"
          autoFocus
          placeholder="https://linkedin.com/in/username"
          className="h-11"
          value={linkedin}
          disabled={pending}
          aria-invalid={!!linkedinError}
          aria-describedby={`${id}-linkedin-hint${linkedinError ? ` ${id}-linkedin-error` : ""}`}
          onChange={(event) => {
            setLinkedin(event.target.value);
            clearErrors();
          }}
        />
        <p id={`${id}-linkedin-hint`} className="text-sm text-muted-foreground">
          Leave this blank to remove your saved link.
        </p>
        {linkedinError && (
          <p id={`${id}-linkedin-error`} role="alert" className="text-sm text-destructive">
            {linkedinError}
          </p>
        )}
      </div>

      <fieldset className="space-y-3" disabled={pending}>
        <legend className="text-sm font-medium">
          Other links ({additional.length} of {MAX_ADDITIONAL_LINKS})
        </legend>
        {additional.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Add up to {MAX_ADDITIONAL_LINKS} links to your work elsewhere.
          </p>
        )}
        {additional.map((link, index) => {
          const invalid = additionalError.index === index;
          return (
            <div key={index} className="space-y-2">
              <div className="flex items-start gap-2">
                <Input
                  ref={(element) => {
                    additionalRefs.current[index] = element;
                  }}
                  aria-label={`Link ${index + 1}`}
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com"
                  className="h-11"
                  value={link}
                  aria-invalid={invalid}
                  aria-describedby={invalid ? `${id}-additional-${index}-error` : undefined}
                  onChange={(event) => {
                    setAdditional(
                      additional.map((current, position) =>
                        position === index ? event.target.value : current,
                      ),
                    );
                    clearErrors();
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  aria-label={`Remove link ${index + 1}`}
                  className="size-11 shrink-0"
                  onClick={() => {
                    setAdditional(additional.filter((_, position) => position !== index));
                    clearErrors();
                  }}
                >
                  <X aria-hidden className="size-4" />
                </Button>
              </div>
              {invalid && (
                <p
                  id={`${id}-additional-${index}-error`}
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {additionalError.message}
                </p>
              )}
            </div>
          );
        })}
        {additional.length < MAX_ADDITIONAL_LINKS && (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setAdditional([...additional, ""]);
              clearErrors();
            }}
          >
            <Plus aria-hidden className="size-4" />
            Add another link
          </Button>
        )}
        {additionalError.index === null && additionalError.message && (
          <p role="alert" className="text-sm text-destructive">
            {additionalError.message}
          </p>
        )}
      </fieldset>

      {saveError && (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          type="button"
          aria-label="Discard link changes"
          variant="outline"
          className="min-h-11"
          disabled={pending}
          onClick={onDiscard}
        >
          Discard changes
        </Button>
        <Button type="submit" className="min-h-11" disabled={pending || unchanged}>
          {pending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
          {pending ? "Saving links…" : "Save links"}
        </Button>
      </div>
    </form>
  );
}
