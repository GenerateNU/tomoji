"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import { TextAreaField } from "@/components/text-area-field";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { AssignmentPicker, type AssignmentOption } from "./assignment-picker";

// The title is saved as `customReason` (backend max 200). The description cap
// follows the design; the backend allows 5000.
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;

// The design's required markers are gray.
const grayRequiredMark = "[&_label>span]:text-gray-500";

type Errors = Partial<Record<"assignment" | "title" | "description", string>>;

export type CreatedDispute = { disputeId: Id<"disputes">; companyName: string };

export function CreateDisputeModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (created: CreatedDispute) => void;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create a Dispute"
      className="sm:max-w-[44rem]"
    >
      {open && <CreateDisputeForm onCancel={() => onOpenChange(false)} onCreated={onCreated} />}
    </Modal>
  );
}

function CreateDisputeForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (created: CreatedDispute) => void;
}) {
  const create = useMutation(api.disputes.create);
  const [assignment, setAssignment] = useState<AssignmentOption | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function clearError(field: keyof Errors) {
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const next: Errors = {};
    if (assignment === null) next.assignment = "Choose the assignment this dispute is about";
    if (!title.trim()) next.title = "Add a title for your dispute";
    if (!description.trim()) next.description = "Describe what's wrong";
    setErrors(next);
    if (assignment === null || Object.values(next).some(Boolean)) return;

    setSubmitting(true);
    setFormError(null);
    try {
      const disputeId = await create({
        assignmentId: assignment.assignmentId,
        // Free-form titles are filed as reason "other".
        reason: "other",
        customReason: title.trim(),
        description: description.trim(),
      });
      onCreated({ disputeId, companyName: assignment.companyName });
    } catch (error) {
      setFormError(
        errorMessage(error, {
          not_found: "We couldn't find that assignment. Choose it again.",
        }),
      );
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2.5">
        <AssignmentPicker
          value={assignment}
          onValueChange={(value) => {
            setAssignment(value);
            clearError("assignment");
          }}
          error={errors.assignment}
        />
        <TextField
          label="Title"
          required
          placeholder="Create a title for your dispute"
          maxLength={TITLE_MAX}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value);
            clearError("title");
          }}
          error={errors.title}
          className={grayRequiredMark}
        />
        <TextAreaField
          label="Describe your dispute"
          required
          placeholder="Let us know what issues you're facing and explain any evidence you're providing..."
          maxLength={DESCRIPTION_MAX}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            clearError("description");
          }}
          error={errors.description}
          className={grayRequiredMark}
        />
      </div>
      {formError && (
        <p role="alert" className="text-body-sm text-red-600">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <Button type="button" variant="secondary-subtle" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Dispute"}
        </Button>
      </div>
    </form>
  );
}
