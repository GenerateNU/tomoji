"use client";

import { useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import {
  createProfilePictureUpload,
  validateProfilePicture,
  type PictureUploadPhase,
} from "../lib/profile-picture";

type PhotoDraft = {
  url: string;
  upload: ReturnType<typeof createProfilePictureUpload>;
  savedMediaId?: Id<"mediaUploads">;
};

/** Selection is local; Save retains the upload grant for safe completion retries. */
export function useProfilePhotoDraft() {
  const requestUpload = useAction(api.media.requestUpload);
  const completeUpload = useAction(api.media.completeUpload);
  const [draft, setDraft] = useState<PhotoDraft>();
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string>();
  const [phase, setPhase] = useState<PictureUploadPhase>();
  const selection = useRef(0);
  const uploadController = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      selection.current += 1;
      uploadController.current?.abort();
    };
  }, []);

  const previewUrl = draft?.url;
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function choose(file: File) {
    const attempt = ++selection.current;
    const invalid = validateProfilePicture(file);
    setError(invalid ?? undefined);
    if (invalid) {
      setValidating(false);
      return;
    }
    setValidating(true);
    const url = URL.createObjectURL(file);
    try {
      const image = new window.Image();
      image.src = url;
      await image.decode();
      if (selection.current !== attempt) {
        URL.revokeObjectURL(url);
        return;
      }
      setDraft({
        url,
        upload: createProfilePictureUpload(file, { requestUpload, completeUpload }),
      });
    } catch {
      URL.revokeObjectURL(url);
      if (selection.current === attempt)
        setError("We couldn't read that picture. Choose another image.");
    } finally {
      if (selection.current === attempt) setValidating(false);
    }
  }

  async function save() {
    if (!draft || draft.savedMediaId) return draft?.savedMediaId;
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      const mediaId = await draft.upload.save(setPhase, controller.signal);
      if (!controller.signal.aborted)
        setDraft((current) => (current === draft ? { ...draft, savedMediaId: mediaId } : current));
      return mediaId;
    } finally {
      if (!controller.signal.aborted) setPhase(undefined);
      if (uploadController.current === controller) uploadController.current = null;
    }
  }

  return {
    previewUrl,
    dirty: draft !== undefined,
    saved: draft?.savedMediaId !== undefined,
    validating,
    error,
    phase,
    choose,
    save,
  };
}
