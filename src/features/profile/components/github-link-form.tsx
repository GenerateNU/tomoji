"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";
import { parseGithubLink } from "../lib/github-link";

export function GithubLinkForm({
  initialValue,
  onDiscard,
  onSaved,
}: {
  initialValue: string;
  onDiscard: () => void;
  onSaved: (cleared: boolean) => void;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const [value, setValue] = useState(initialValue);
  const [pending, setPending] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const [saveError, setSaveError] = useState("");
  const update = useMutation(api.creators.update);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const parsed = parseGithubLink(value);
    if (!parsed.ok) {
      setFieldError(parsed.error);
      inputRef.current?.focus();
      return;
    }
    submitting.current = true;
    setPending(true);
    setSaveError("");
    try {
      await update({ githubLink: parsed.value });
      onSaved(parsed.value === null);
    } catch (error) {
      setSaveError(errorMessage(error));
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor={id}>GitHub profile URL</Label>
        <Input
          ref={inputRef}
          id={id}
          name="githubLink"
          type="url"
          inputMode="url"
          autoComplete="url"
          autoFocus
          placeholder="https://github.com/username"
          className="h-11"
          value={value}
          disabled={pending}
          aria-invalid={!!fieldError}
          aria-describedby={`${id}-hint${fieldError ? ` ${id}-error` : ""}`}
          onChange={(event) => {
            setValue(event.target.value);
            setFieldError("");
            setSaveError("");
          }}
        />
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          Share your work on GitHub. Leave this blank to remove your saved link.
        </p>
        {fieldError && (
          <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
            {fieldError}
          </p>
        )}
      </div>
      {saveError && (
        <p role="alert" className="text-sm text-destructive">
          {saveError}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          type="button"
          aria-label="Discard GitHub changes"
          variant="secondary"
          className="min-h-11"
          disabled={pending}
          onClick={onDiscard}
        >
          Discard changes
        </Button>
        <Button type="submit" className="min-h-11" disabled={pending || value === initialValue}>
          {pending && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
          {pending ? "Saving GitHub profile…" : "Save GitHub profile"}
        </Button>
      </div>
    </form>
  );
}
