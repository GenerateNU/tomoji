"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useAction } from "convex/react";
import { LoaderCircle, UserRound } from "lucide-react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { errorCode, errorMessage } from "@/lib/errors";
import { useProfilePicture } from "../hooks/use-profile-picture";
import {
  createProfilePictureUpload,
  profilePictureTypes,
  validateProfilePicture,
  type PictureUploadPhase,
} from "../lib/profile-picture";

const UPLOADS_ENABLED = false;

type Selection = { file: File; url: string; upload: ReturnType<typeof createProfilePictureUpload> };

export function ProfilePictureSection({ mediaId }: { mediaId?: Id<"mediaUploads"> }) {
  const id = useId();
  const currentPicture = useProfilePicture(mediaId);
  const requestUpload = useAction(api.media.requestUpload);
  const completeUpload = useAction(api.media.completeUpload);
  const [selection, setSelection] = useState<Selection>();
  const [checking, setChecking] = useState(false);
  const [phase, setPhase] = useState<PictureUploadPhase>();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const selectionVersion = useRef(0);
  const mounted = useRef(true);
  const saving = useRef(false);
  const controller = useRef<AbortController | undefined>(undefined);
  const busy = checking || phase !== undefined;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      selectionVersion.current += 1;
      controller.current?.abort();
    };
  }, []);

  useEffect(
    () => () => {
      if (selection) URL.revokeObjectURL(selection.url);
    },
    [selection],
  );

  useEffect(() => {
    if (saved) chooseButton.current?.focus();
  }, [saved]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || saving.current) return;
    const version = ++selectionVersion.current;
    setError(undefined);
    setSaved(false);
    setSelection(undefined);
    setChecking(false);
    const invalid = validateProfilePicture(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    setChecking(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new window.Image();
      image.src = url;
      await image.decode();
      if (!mounted.current || version !== selectionVersion.current) {
        URL.revokeObjectURL(url);
        return;
      }
      setSelection({
        file,
        url,
        upload: createProfilePictureUpload(file, { requestUpload, completeUpload }),
      });
    } catch {
      URL.revokeObjectURL(url);
      if (mounted.current && version === selectionVersion.current)
        setError("This image couldn't be opened. Choose another JPEG, PNG, or WebP picture.");
    } finally {
      if (mounted.current && version === selectionVersion.current) setChecking(false);
    }
  }

  async function save() {
    if (!selection || saving.current) return;
    saving.current = true;
    controller.current = new AbortController();
    setError(undefined);
    let completing = false;
    try {
      await selection.upload.save((nextPhase) => {
        completing = nextPhase === "saving";
        if (mounted.current) setPhase(nextPhase);
      }, controller.current.signal);
      if (!mounted.current) return;
      setSelection(undefined);
      setSaved(true);
    } catch (cause) {
      if (mounted.current)
        setError(
          errorCode(cause)
            ? errorMessage(cause, {
                upstream_failure: "We couldn't save your picture. Try saving again.",
                invalid_state:
                  "We couldn't finish this upload. Choose the picture again and retry.",
              })
            : completing
              ? "We couldn't confirm the save. Try saving again."
              : "We couldn't upload your picture. Try saving again.",
        );
    } finally {
      saving.current = false;
      if (mounted.current) setPhase(undefined);
    }
  }

  function discard() {
    setSelection(undefined);
    setError(undefined);
    setSaved(false);
    chooseButton.current?.focus();
  }

  const url = selection?.url ?? currentPicture.url;
  return (
    <section aria-labelledby={`${id}-heading`} className="rounded-2xl bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 id={`${id}-heading`} className="text-xl font-semibold">
          Profile picture
        </h2>
        {selection && (
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" variant="secondary" disabled={busy} onClick={discard}>
              Discard changes
            </Button>
            <Button className="min-h-11" disabled={busy} onClick={() => void save()}>
              {phase && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              {phase === "uploading"
                ? "Uploading…"
                : phase === "saving"
                  ? "Saving picture…"
                  : "Save picture"}
            </Button>
          </div>
        )}
      </div>
      <div className="mt-6 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
          {url ? (
            <Image
              src={url}
              alt={selection ? "New profile picture preview" : "Your profile picture"}
              fill
              unoptimized
              sizes="112px"
              className="object-cover"
            />
          ) : (
            <UserRound className="size-12 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">
            {UPLOADS_ENABLED
              ? "JPEG, PNG, or WebP. Up to 2 MB."
              : "Profile picture uploads are coming soon."}
          </p>
          <input
            ref={input}
            type="file"
            accept={profilePictureTypes.join(",")}
            aria-label="Choose profile picture"
            aria-describedby={`${id}-hint`}
            hidden
            disabled={busy || !UPLOADS_ENABLED}
            onChange={(event) => void choose(event)}
          />
          <Button
            ref={chooseButton}
            className="min-h-11"
            variant="secondary"
            disabled={busy || !UPLOADS_ENABLED}
            onClick={() => input.current?.click()}
          >
            {mediaId || selection ? "Change picture" : "Choose picture"}
          </Button>
          {selection && (
            <p className="text-sm text-muted-foreground break-all">
              {selection.file.name} · Preview only until you save.
            </p>
          )}
          {checking && (
            <p role="status" className="text-sm text-muted-foreground">
              Checking picture…
            </p>
          )}
          {phase && (
            <p role="status" className="text-sm text-muted-foreground">
              {phase === "uploading" ? "Uploading your picture…" : "Saving your picture…"}
            </p>
          )}
          {!selection && currentPicture.loading && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading picture…
            </p>
          )}
          {!selection && currentPicture.error && (
            <div className="space-y-2">
              <p role="alert" className="text-sm text-destructive">
                {currentPicture.error}
              </p>
              <Button
                className="min-h-11"
                variant="secondary"
                disabled={busy}
                onClick={currentPicture.retry}
              >
                Retry loading picture
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-sm">
              Profile picture saved.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
