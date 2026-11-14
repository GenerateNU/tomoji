"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useAction, useMutation } from "convex/react";
import { useRef, useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import { TextAreaField } from "@/components/text-area-field";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { errorCode, errorMessage } from "@/lib/errors";
import { createMediaUpload } from "@/lib/media-upload";
import { AssignmentPicker, type AssignmentOption } from "./assignment-picker";
import { EvidenceField } from "./evidence-field";

// The title is saved as `customReason` (backend max 200). The description cap
// follows the design; the backend allows 5000.
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;

// The design's required markers are gray.
const grayRequiredMark = "[&_label>span]:text-gray-500";

type Errors = Partial<Record<"assignment" | "title" | "description" | "evidence", string>>;

type Upload = ReturnType<typeof createMediaUpload>;

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
  const requestUpload = useAction(api.media.requestUpload);
  const completeUpload = useAction(api.media.completeUpload);
  const [assignment, setAssignment] = useState<AssignmentOption | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState<File[]>([]);
  // Reused on retry so finished transfers aren't sent again. Uploads are bound
  // to an assignment, so a new pick starts over.
  const uploads = useRef(new Map<File, { assignmentId: string; upload: Upload }>());
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"uploading" | "submitting">();

  function clearError(field: keyof Errors) {
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase) return;
    const next: Errors = {};
    if (assignment === null) next.assignment = "Choose the assignment this dispute is about";
    if (!title.trim()) next.title = "Add a title for your dispute";
    if (!description.trim()) next.description = "Describe what's wrong";
    if (evidence.length === 0) next.evidence = "Upload at least one file as evidence";
    setErrors(next);
    if (assignment === null || Object.values(next).some(Boolean)) return;

    setFormError(null);
    let evidenceMediaIds;
    try {
      setPhase("uploading");
      evidenceMediaIds = await Promise.all(
        evidence.map((file) => uploadFor(file, assignment.assignmentId).save()),
      );
    } catch (error) {
      setFormError(
        errorCode(error)
          ? errorMessage(error, { invalid_state: "One of your files couldn't be uploaded." })
          : "We couldn't upload your evidence. Check your connection and try again.",
      );
      setPhase(undefined);
      return;
    }
    try {
      setPhase("submitting");
      const disputeId = await create({
        assignmentId: assignment.assignmentId,
        // Free-form titles are filed as reason "other".
        reason: "other",
        customReason: title.trim(),
        description: description.trim(),
        evidenceMediaIds,
      });
      onCreated({ disputeId, companyName: assignment.companyName });
    } catch (error) {
      setFormError(
        errorMessage(error, {
          not_found: "We couldn't find that assignment. Choose it again.",
        }),
      );
      setPhase(undefined);
    }
  }

  function uploadFor(file: File, assignmentId: AssignmentOption["assignmentId"]) {
    const cached = uploads.current.get(file);
    if (cached?.assignmentId === assignmentId) return cached.upload;
    const upload = createMediaUpload(
      file,
      { kind: "dispute-evidence", assignmentId, timeoutMs: 60_000 },
      { requestUpload, completeUpload },
    );
    uploads.current.set(file, { assignmentId, upload });
    return upload;
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
        <EvidenceField
          files={evidence}
          onFilesChange={(files) => {
            setEvidence(files);
            clearError("evidence");
          }}
          onReject={(message) => setErrors((current) => ({ ...current, evidence: message }))}
          error={errors.evidence}
          disabled={phase !== undefined}
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
        <Button type="submit" disabled={phase !== undefined}>
          {phase === "uploading"
            ? "Uploading evidence…"
            : phase === "submitting"
              ? "Submitting…"
              : "Submit Dispute"}
        </Button>
      </div>
    </form>
  );
}
