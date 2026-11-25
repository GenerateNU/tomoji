export type DraftFormValues = {
  notes: string;
  caption: string;
  hasVideo: boolean;
};

export type DraftFormErrors = Partial<Record<"notes" | "content", string>>;

/**
 * Checks a draft prior to submission. Returns an error message for given issue.
 * Mirrors `submissions.create`: draft notes are required, plus a caption OR a video.
 */
export function validateDraft({ notes, caption, hasVideo }: DraftFormValues): DraftFormErrors {
  const errors: DraftFormErrors = {};
  if (notes.trim().length === 0) errors.notes = "Add draft notes.";
  if (caption.trim().length === 0 && !hasVideo) errors.content = "Add a caption or a video.";
  return errors;
}
