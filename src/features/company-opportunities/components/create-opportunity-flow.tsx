"use client";

import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { RiCheckLine, RiCloseLine } from "@remixicon/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ErrorBoundary } from "@/components/error-boundary";
import { Logo } from "@/components/logo";
import { Stepper } from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { RequireAccount } from "@/features/users/components/require-account";
import { errorMessage, errorReason } from "@/lib/errors";
import { focusRing } from "@/lib/styles";
import { cn } from "@/lib/utils";
import { useCatalogOptions } from "../hooks/use-catalog-options";
import {
  EMPTY_OPPORTUNITY_FORM,
  parseOpportunityForm,
  validateOpportunityStep,
  type OpportunityFormErrors,
  type OpportunityFormValues,
  type OpportunityInput,
  type OpportunityStep,
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
import { OpportunityPreview } from "./opportunity-preview";
import { OpportunityReview, reviewSectionOf } from "./opportunity-review";

const STEPS: { label: string; title: string; subtitle: string; step?: OpportunityStep }[] = [
  {
    label: "Opportunity Details",
    title: "Opportunity Details",
    subtitle: "Set up your opportunity’s basic information",
    step: "details",
  },
  {
    label: "Requirements",
    title: "Opportunity Requirements",
    subtitle: "Set up your opportunity’s basic requirements",
    step: "requirements",
  },
  {
    label: "Compensation",
    title: "Compensation and Payout",
    subtitle: "Define how creators will be compensated",
    step: "compensation",
  },
  {
    label: "Policy",
    title: "Review Policy",
    subtitle: "Set how content will be reviewed",
    step: "policy",
  },
  {
    label: "Review",
    title: "Review",
    subtitle: "Review opportunity information before launching",
  },
];
const REVIEW = STEPS.length - 1;

/** Backend reasons that point at one field, with what to tell the user there. */
const FIELD_ERRORS: Record<string, [field: string, message: string]> = {
  invalid_deadline: ["deadlineDate", "Pick a date from today on."],
  deadline_after_campaign_end: ["deadlineDate", "The deadline must fall before the campaign ends."],
  invalid_product_access_link: ["productAccessLink", "Enter a full web address."],
  ai_review_criteria_required: [
    "usesAiReview",
    "Add review criteria to every deliverable, or turn AI review off.",
  ],
  deliverables_required: ["deliverables", "Add at least one deliverable."],
  too_many_niches: ["niches", "Choose at most 5."],
  too_many_skills: ["skills", "Choose at most 5."],
  too_many_languages: ["languages", "Choose at most 5."],
};

/** Moves focus, and so the scroll position, to the first field marked invalid once it renders. */
function focusFirstError() {
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')?.focus();
  });
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-gray-0 p-6 shadow-card sm:p-8 lg:px-12">{children}</div>;
}

function CenteredStatus({ children }: { children: ReactNode }) {
  return (
    <div
      role="status"
      className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-center"
    >
      {children}
    </div>
  );
}

function Flow({ campaign }: { campaign: Doc<"campaigns"> }) {
  const router = useRouter();
  const create = useMutation(api.opportunities.create);
  const catalog = useCatalogOptions();
  const [now] = useState(() => Date.now());
  const context = { now, campaignEndsAt: campaign.endsAt };
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<OpportunityFormValues>(EMPTY_OPPORTUNITY_FORM);
  const [errors, setErrors] = useState<OpportunityFormErrors>({});
  const [input, setInput] = useState<OpportunityInput | null>(null);
  const [editing, setEditing] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState<"open" | "draft" | null>(null);
  const [launched, setLaunched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const campaignHref = `/campaigns/${campaign._id}`;
  // Creators only see opportunities in a live campaign, so launching waits for it.
  const canLaunch = campaign.status === "open";

  function change(changes: Partial<OpportunityFormValues>) {
    const next = { ...values, ...changes };
    setValues(next);
    // Keep the review's summary on the latest answers that check out.
    if (step === REVIEW) {
      const parsed = parseOpportunityForm(next, context);
      if (parsed.input) setInput(parsed.input);
    }
  }

  function goTo(index: number) {
    setStep(index);
    setError(null);
    window.scrollTo({ top: 0 });
  }

  function next() {
    const current = STEPS[step].step!;
    const found = validateOpportunityStep(values, current, context);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      focusFirstError();
      return;
    }
    if (step + 1 === REVIEW) {
      const parsed = parseOpportunityForm(values, context);
      if (parsed.errors) {
        setErrors(parsed.errors);
        return;
      }
      setInput(parsed.input);
      setEditing([]);
    }
    goTo(step + 1);
  }

  /** Shows errors on the review step by opening the sections they belong to. */
  function showOnReview(found: OpportunityFormErrors) {
    setErrors(found);
    setEditing([...new Set([...editing, ...Object.keys(found).map(reviewSectionOf)])]);
    focusFirstError();
  }

  async function save(status: "open" | "draft") {
    if (saving !== null) return;
    const parsed = parseOpportunityForm(values, context);
    if (parsed.errors) {
      showOnReview(parsed.errors);
      setError("Fix the highlighted answers first.");
      return;
    }
    setInput(parsed.input);
    setSaving(status);
    setError(null);
    try {
      await create({ ...parsed.input, campaignId: campaign._id, status });
      if (status === "draft") router.push(campaignHref);
      else setLaunched(true);
    } catch (caught) {
      const reason = errorReason(caught);
      const field = reason === null ? undefined : FIELD_ERRORS[reason];
      if (field) {
        showOnReview({ [field[0]]: field[1] });
        setError("Fix the highlighted answer, then try again.");
      } else {
        setError(
          errorMessage(caught, {
            invalid_state:
              reason === "campaign_not_open"
                ? "This campaign isn’t live, so the opportunity can only be saved as a draft."
                : "Check the opportunity’s details, then try again.",
            not_found: "This campaign is no longer available.",
          }),
        );
      }
    } finally {
      setSaving(null);
    }
  }

  if (saving === "open") {
    return (
      <CenteredStatus>
        <Logo type="collapsed" className="animate-pulse text-gray-400" aria-hidden />
        <h1 className="text-heading-sm text-gray-950">Setting your opportunity live…</h1>
        <p className="text-body-sm text-gray-500">
          We’re opening it to creators who match your eligibility requirements.
        </p>
      </CenteredStatus>
    );
  }
  if (launched && input !== null) {
    return (
      <div className="flex min-h-[80vh] flex-col px-4 py-12 sm:px-10">
        <CenteredStatus>
          <span className="flex size-6 items-center justify-center rounded-sm bg-blue-subtle text-primary">
            <RiCheckLine size={16} aria-hidden />
          </span>
          <h1 className="text-heading-sm text-gray-950">{input.title} is live!</h1>
          <p className="text-body-sm text-gray-500">
            Click continue to view the campaign’s opportunities
          </p>
        </CenteredStatus>
        <Button className="self-end" render={<Link href={campaignHref} />} nativeButton={false}>
          Continue
        </Button>
      </div>
    );
  }

  const props: FieldsProps = {
    values,
    errors,
    onChange: change,
    campaignEndsAt: campaign.endsAt,
  };
  const { title, subtitle } = STEPS[step];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-10">
      <Stepper steps={STEPS.map((s) => s.label)} current={step} />
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-heading-md text-gray-950">{title}</h1>
          <p className="text-body text-gray-500">{subtitle}</p>
        </div>
        {step === REVIEW && input !== null ? (
          <Button variant="primary-subtle" onClick={() => setPreviewing(true)}>
            View Preview
          </Button>
        ) : (
          <Link
            href={campaignHref}
            aria-label="Cancel and go back to the campaign"
            className={cn("rounded-xs text-gray-500 hover:text-gray-950", focusRing)}
          >
            <RiCloseLine size={24} aria-hidden />
          </Link>
        )}
      </header>

      {step === 0 && (
        <Card>
          <DetailsFields {...props} />
        </Card>
      )}
      {step === 1 && (
        <>
          <Card>
            <div className="flex flex-col gap-10">
              <FormSection
                title="Content Requirements"
                description="Specify content requirements for your creators"
              >
                <RequirementsFields
                  {...props}
                  only={["contentRequirements", "productAccessLink"]}
                />
              </FormSection>
              <FormSection
                title="Deliverables"
                description="Each piece of content every creator who joins must make"
              >
                <RequirementsFields {...props} only={["deliverables"]} />
              </FormSection>
              <FormSection
                title="Number of slots"
                description="Select number of slots available for this opportunity"
              >
                <RequirementsFields {...props} only={["maxSlots"]} />
              </FormSection>
            </div>
          </Card>
          <Card>
            <FormSection
              title="Eligibility Requirements"
              description="Define who this opportunity is for. Matching creators see it first."
            >
              <EligibilityFields {...props} catalog={catalog} />
            </FormSection>
          </Card>
        </>
      )}
      {step === 2 && (
        <Card>
          <CompensationFields {...props} />
        </Card>
      )}
      {step === 3 && (
        <Card>
          <PolicyFields {...props} />
        </Card>
      )}
      {step === REVIEW && input !== null && (
        <Card>
          <OpportunityReview
            values={values}
            errors={errors}
            onChange={change}
            onErrors={setErrors}
            input={input}
            catalog={catalog}
            campaignEndsAt={campaign.endsAt}
            editing={editing}
            onEditingChange={setEditing}
          />
          <OpportunityPreview
            open={previewing}
            onOpenChange={setPreviewing}
            input={input}
            catalog={catalog}
          />
        </Card>
      )}

      {error && (
        <p role="alert" className="text-body-sm text-red-600">
          {error}
        </p>
      )}
      {step === REVIEW && !canLaunch && (
        <p className="text-body-sm text-gray-500">
          This campaign isn’t live yet, so you can save the opportunity as a draft and launch it
          once the campaign is.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        {step > 0 && (
          <Button
            variant="secondary-subtle"
            onClick={() => goTo(step - 1)}
            disabled={saving !== null}
            className="min-w-40"
          >
            Back
          </Button>
        )}
        {step < REVIEW ? (
          <Button onClick={next} className="min-w-40">
            Continue
          </Button>
        ) : (
          <>
            <Button
              variant="secondary-ghost"
              onClick={() => save("draft")}
              disabled={saving !== null}
            >
              {saving === "draft" ? "Saving…" : "Save as Draft"}
            </Button>
            <Button
              onClick={() => save("open")}
              disabled={saving !== null || !canLaunch}
              className="min-w-40"
            >
              Launch Opportunity
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function LoadCampaign({ campaignId }: { campaignId: Id<"campaigns"> }) {
  const campaign = useQuery(api.campaigns.get, { campaignId });
  if (campaign === undefined) {
    return (
      <div
        aria-busy="true"
        aria-label="Loading opportunity form"
        className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-10"
      >
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-96 w-full rounded-lg" />
      </div>
    );
  }
  if (campaign.status === "closed") {
    return (
      <CenteredStatus>
        <h1 className="text-heading-sm text-gray-950">{campaign.title} has ended</h1>
        <p className="text-body-sm text-gray-500">Ended campaigns can’t take new opportunities.</p>
        <Button
          variant="secondary-subtle"
          render={<Link href={`/campaigns/${campaign._id}`} />}
          nativeButton={false}
        >
          Back to the campaign
        </Button>
      </CenteredStatus>
    );
  }
  return <Flow campaign={campaign} />;
}

/**
 * Creating an opportunity in a campaign: details, requirements, compensation,
 * review policy, then a review that can launch it (open) or save it as a draft.
 */
export function CreateOpportunityFlow({ campaignId }: { campaignId: string }) {
  return (
    <RequireAccount
      role="company"
      next={`/campaigns/${campaignId}/opportunities/new`}
      wrongRole="A company account is required to create opportunities."
      loading="Loading opportunity form…"
      unsynced="We’re finishing setting up your account."
    >
      <ErrorBoundary
        fallback={() => (
          <CenteredStatus>
            <h1 className="text-heading-sm text-gray-950">We couldn’t find this campaign</h1>
            <p className="text-body-sm text-gray-500">
              It may have been removed, or it belongs to another company.
            </p>
            <Button
              variant="secondary-subtle"
              render={<Link href="/campaigns" />}
              nativeButton={false}
            >
              Back to campaigns
            </Button>
          </CenteredStatus>
        )}
      >
        <LoadCampaign campaignId={campaignId as Id<"campaigns">} />
      </ErrorBoundary>
    </RequireAccount>
  );
}
