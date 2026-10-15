"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/errors";

//check is FE only
const NOTE_MAX_LENGTH = 200;

/** The note a creator must attach, and the mutation that submits the application. */
export function ApplicationNoteForm({
  opportunityId,
  onBack,
  onSubmitted,
}: {
  opportunityId: Id<"opportunities">;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const createApplication = useMutation(api.applications.create);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await createApplication({ opportunityId, note: note.trim() });
      onSubmitted();
    } catch (caught) {
      setError(
        errorMessage(caught, {
          conflict: "You've already applied to this opportunity.",
          invalid_state: "This opportunity isn't accepting applications anymore.",
          not_found: "This opportunity is no longer available.",
        }),
      );
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <DialogTitle>
        <Label htmlFor="application-note" className="gap-0 text-base">
          Note<span className="text-destructive">*</span>
        </Label>
      </DialogTitle>
      <DialogDescription className="text-foreground">
        To submit this application, you must attach a note for the team to review.
      </DialogDescription>
      <div className="relative">
        <Textarea
          id="application-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Write a message…"
          maxLength={NOTE_MAX_LENGTH}
          required
          className="min-h-28 resize-none pb-8"
        />
        <span className="absolute right-3 bottom-2 text-muted-foreground">
          {note.length}/{NOTE_MAX_LENGTH}
        </span>
      </div>
      {error && <p className="text-destructive">{error}</p>}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={submitting || note.trim() === ""}
      >
        {submitting ? "Applying…" : "Apply"}
      </Button>
      <Button type="button" variant="link" onClick={onBack} disabled={submitting}>
        Back
      </Button>
    </form>
  );
}
