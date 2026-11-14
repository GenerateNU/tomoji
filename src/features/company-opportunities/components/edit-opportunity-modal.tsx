"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { ErrorBoundary } from "@/components/error-boundary";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, errorReason } from "@/lib/errors";
import { useCatalogOptions } from "../hooks/use-catalog-options";
import {
  opportunityFormValues,
  parseOpportunityUpdate,
  type OpportunityFormErrors,
  type OpportunityFormValues,
} from "../lib/opportunity-form";
import {
  CompensationFields,
  DetailsFields,
  EligibilityFields,
  FormSection,
  PolicyFields,
  RequirementsFields,
  type FieldsProps,
} from "./opportunity-fields";

const FORM_ID = "edit-opportunity-form";

/** Backend reasons that point at one field, with what to tell the user there. */
const FIELD_ERRORS: Record<string, [field: string, message: string]> = {
  invalid_deadline: ["deadlineDate", "Pick a date from today on."],
  deadline_after_campaign_end: ["deadlineDate", "The deadline must fall before the campaign ends."],
  capacity_below_filled_slots: [
    "maxSlots",
    "Can’t be fewer than the creators already taking part.",
  ],
  invalid_product_access_link: ["productAccessLink", "Enter a full web address."],
  ai_review_criteria_required: [
    "usesAiReview",
    "Every deliverable needs review criteria before AI review can be on.",
  ],
};

function EditForm({
  original,
  campaignEndsAt,
  opportunityId,
  onSaved,
  onPendingChange,
}: {
  original: OpportunityFormValues;
  campaignEndsAt: number | undefined;
  opportunityId: Id<"opportunities">;
  onSaved: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const update = useMutation(api.opportunities.update);
  const catalog = useCatalogOptions();
  const [now] = useState(() => Date.now());
  const [values, setValues] = useState(original);
  const [errors, setErrors] = useState<OpportunityFormErrors>({});
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const parsed = parseOpportunityUpdate(values, original, { now, campaignEndsAt });
    if (parsed.errors) {
      setErrors(parsed.errors);
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(`#${FORM_ID} [aria-invalid="true"]`)?.focus(),
      );
      return;
    }
    setErrors({});
    if (Object.keys(parsed.updates).length === 0) {
      onSaved();
      return;
    }
    onPendingChange(true);
    setError(null);
    try {
      await update({ opportunityId, ...parsed.updates });
      toast.success(`${values.title.trim()} was updated.`);
      onSaved();
    } catch (caught) {
      const reason = errorReason(caught);
      const field = reason === null ? undefined : FIELD_ERRORS[reason];
      if (field) setErrors({ [field[0]]: field[1] });
      else {
        setError(
          errorMessage(caught, {
            invalid_state:
              reason === "opportunity_not_editable" || reason === "opportunity_expired"
                ? "This opportunity can’t be edited anymore."
                : "Check the opportunity’s details, then try again.",
            not_found: "This opportunity no longer exists.",
          }),
        );
      }
    } finally {
      onPendingChange(false);
    }
  }

  const props: FieldsProps = {
    values,
    errors,
    onChange: (changes) => setValues((current) => ({ ...current, ...changes })),
    campaignEndsAt,
  };
  return (
    <form
      id={FORM_ID}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="flex flex-col gap-10"
    >
      <DetailsFields {...props} />
      <RequirementsFields
        {...props}
        only={["contentRequirements", "productAccessLink", "maxSlots"]}
      />
      <FormSection title="Eligibility" description="Who this opportunity is for">
        <EligibilityFields {...props} catalog={catalog} />
      </FormSection>
      <FormSection title="Compensation" description="How creators who join are paid">
        <CompensationFields {...props} />
      </FormSection>
      <FormSection title="Review policy" description="How submitted content is reviewed">
        <PolicyFields {...props} />
      </FormSection>
      <p className="text-body-sm text-gray-500">
        Pay changes apply to creators who join from now on; creators already taking part keep their
        agreed terms.
      </p>
      {error && (
        <p role="alert" className="text-body-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}

function LoadedForm(props: {
  opportunityId: Id<"opportunities">;
  onSaved: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const result = useQuery(api.opportunities.get, { opportunityId: props.opportunityId });
  // Company users always get the full brief; `companyName` marks the creator-facing shape.
  const opportunity = result === undefined || "companyName" in result ? undefined : result;
  const campaign = useQuery(
    api.campaigns.get,
    opportunity === undefined ? "skip" : { campaignId: opportunity.campaignId },
  );
  if (opportunity === undefined || campaign === undefined) {
    return (
      <div aria-busy="true" aria-label="Loading opportunity" className="flex flex-col gap-6">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-12 w-72" />
      </div>
    );
  }
  return (
    <EditForm
      {...props}
      original={opportunityFormValues(opportunity)}
      campaignEndsAt={campaign.endsAt}
    />
  );
}

/** Edits an opportunity's brief. Deliverables aren't part of it and stay as they are. */
export function EditOpportunityModal({
  opportunityId,
  title,
  onClose,
}: {
  /** The opportunity being edited, or null when closed. */
  opportunityId: Id<"opportunities"> | null;
  /** Shown under the heading while the brief loads. */
  title: string;
  onClose: () => void;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Modal
      open={opportunityId !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title="Edit Opportunity"
      titleSize="lg"
      eyebrow={<span className="truncate text-body-sm text-gray-500">{title}</span>}
      className="max-h-[90vh] sm:max-w-3xl"
      footer={
        <>
          <Button variant="secondary-ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      {opportunityId !== null && (
        <ErrorBoundary
          key={opportunityId}
          fallback={() => (
            <p role="alert" className="text-body-sm text-red-600">
              This opportunity couldn’t be loaded. It may have been deleted.
            </p>
          )}
        >
          <LoadedForm
            opportunityId={opportunityId}
            onSaved={onClose}
            onPendingChange={setPending}
          />
        </ErrorBoundary>
      )}
    </Modal>
  );
}
