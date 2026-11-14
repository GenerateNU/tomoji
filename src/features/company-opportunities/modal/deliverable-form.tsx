"use client";

import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/spinner";
import { TextAreaField } from "@/components/text-area-field";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { deliverableErrorMessage } from "./lib/deliverable-rules";
import {
  MAX_CRITERIA,
  criteriaFromText,
  criteriaProblem,
  criteriaToText,
} from "./lib/review-criteria";

// The server's limits (convex/models/deliverableDrafts.ts), so the counters match.
const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;

type Field = "title" | "description" | "criteria";

type DeliverableFormProps = {
  opportunityId: Id<"opportunities">;
  /** The assignment to edit; omit to create one. */
  deliverable?: Doc<"deliverables">;
  /** AI review is on for the opportunity, so the server requires criteria. */
  requireCriteria: boolean;
  onCancel: () => void;
  onSaved: (deliverableId: Id<"deliverables">) => void;
};

function fieldProblem(field: Field, value: string, requireCriteria: boolean): string | null {
  const trimmed = value.trim();
  if (field === "title") {
    if (!trimmed) return "Add a title.";
    if (trimmed.length > MAX_TITLE) return `Keep the title under ${MAX_TITLE} characters.`;
    return null;
  }
  if (field === "description") {
    return trimmed ? null : "Describe what creators should make.";
  }
  return criteriaProblem(value, { required: requireCriteria });
}

/**
 * Creates or edits one assignment (a backend deliverable): its title, the
 * content requirements creators read, and the criteria a review checks.
 */
export function DeliverableForm({
  opportunityId,
  deliverable,
  requireCriteria,
  onCancel,
  onSaved,
}: DeliverableFormProps) {
  const create = useMutation(api.deliverables.create);
  const update = useMutation(api.deliverables.update);
  const existingCriteria = deliverable?.reviewCriteria ?? [];
  const [values, setValues] = useState<Record<Field, string>>({
    title: deliverable?.title ?? "",
    description: deliverable?.description ?? "",
    criteria: criteriaToText(existingCriteria),
  });
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const criteriaRef = useRef<HTMLTextAreaElement>(null);

  const problems: Record<Field, string | null> = {
    title: fieldProblem("title", values.title, requireCriteria),
    description: fieldProblem("description", values.description, requireCriteria),
    criteria: fieldProblem("criteria", values.criteria, requireCriteria),
  };
  const shown = (field: Field) => (touched[field] ? (problems[field] ?? undefined) : undefined);

  const bind = (field: Field) => ({
    value: values[field],
    onChange: (event: { target: { value: string } }) =>
      setValues((current) => ({ ...current, [field]: event.target.value })),
    onBlur: () => setTouched((current) => ({ ...current, [field]: true })),
    error: shown(field),
    disabled: submitting,
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setTouched({ title: true, description: true, criteria: true });
    const firstInvalid = (["title", "description", "criteria"] as const).find(
      (field) => problems[field] !== null,
    );
    if (firstInvalid) {
      const target = { title: titleRef, description: descriptionRef, criteria: criteriaRef }[
        firstInvalid
      ];
      target.current?.focus();
      return;
    }
    setSubmitting(true);
    setFormError(null);
    const reviewCriteria = criteriaFromText(values.criteria, existingCriteria);
    try {
      if (deliverable) {
        await update({
          deliverableId: deliverable._id,
          title: values.title,
          description: values.description,
          // An empty list clears criteria, which manual-review opportunities allow.
          reviewCriteria,
        });
        toast.success("Assignment saved.");
        onSaved(deliverable._id);
      } else {
        const deliverableId = await create({
          opportunityId,
          title: values.title,
          description: values.description,
          ...(reviewCriteria.length > 0 ? { reviewCriteria } : {}),
        });
        toast.success("Assignment created.");
        onSaved(deliverableId);
      }
    } catch (error) {
      setFormError(deliverableErrorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-6" aria-busy={submitting}>
      <TextField
        ref={titleRef}
        label="Assignment title"
        required
        placeholder="E.g. Build a web app with Opus"
        maxLength={MAX_TITLE}
        autoFocus
        className="sm:max-w-80"
        {...bind("title")}
      />
      <TextAreaField
        ref={descriptionRef}
        label="Content requirements"
        required
        placeholder="What should creators make? List the details and requirements."
        helper="Creators see this when they join. Line breaks are kept."
        maxLength={MAX_DESCRIPTION}
        rows={5}
        {...bind("description")}
      />
      <TextAreaField
        ref={criteriaRef}
        label="Review criteria"
        required={requireCriteria}
        placeholder={"Disclose the sponsorship with #ad\nShow the finished app in the video"}
        helper={`One per line, up to ${MAX_CRITERIA}. Each draft is checked against these${
          requireCriteria ? " by AI review" : ""
        }.`}
        rows={4}
        {...bind("criteria")}
      />
      {formError ? (
        <p role="alert" className="text-body-sm text-red-600">
          {formError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2.5">
        <Button type="button" variant="secondary-ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Spinner size={16} label="Saving" className="text-current" /> : null}
          {deliverable ? "Save changes" : "Create"}
        </Button>
      </div>
    </form>
  );
}
