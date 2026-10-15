"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/errors";
import { parseGithubLink } from "../lib/github-link";

export function GithubLinkSection({ githubLink }: { githubLink?: string }) {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const [success, setSuccess] = useState("");
  const editButton = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const savedLink = parseGithubLink(githubLink ?? "");

  useEffect(() => {
    if (!editing && wasEditing.current) editButton.current?.focus();
    wasEditing.current = editing;
  }, [editing]);

  return (
    <section aria-labelledby={headingId} className="rounded-2xl bg-card p-6 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h2 id={headingId} className="text-xl font-semibold tracking-tight">
          Portfolio
        </h2>
        {!editing && (
          <Button
            ref={editButton}
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setSuccess("");
              setEditing(true);
            }}
          >
            {githubLink ? "Edit GitHub profile" : "Add GitHub profile"}
          </Button>
        )}
      </div>
      {editing ? (
        <GithubLinkForm
          initialValue={githubLink ?? ""}
          onDiscard={() => setEditing(false)}
          onSaved={(cleared) => {
            setEditing(false);
            setSuccess(cleared ? "GitHub profile removed." : "GitHub profile saved.");
          }}
        />
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">GitHub profile</h3>
          {savedLink.ok && savedLink.value ? (
            <a
              href={savedLink.value}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-2 rounded text-sm underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0 break-all">{savedLink.value}</span>
              <ExternalLink aria-hidden className="size-4 shrink-0" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : githubLink ? (
            <p className="text-sm text-muted-foreground">
              Your saved link needs updating. Edit it to add a valid GitHub URL.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No GitHub profile added yet.</p>
          )}
        </div>
      )}
      <p role="status" className="mt-3 text-sm text-muted-foreground">
        {success}
      </p>
    </section>
  );
}

function GithubLinkForm({
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
          variant="outline"
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
