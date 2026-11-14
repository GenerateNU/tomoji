"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { RiCheckLine, RiCloseLine, RiPencilLine } from "@remixicon/react";
import { useMutation } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/logo";
import { ModalIconButton } from "@/components/modal";
import { Stepper } from "@/components/stepper";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import {
  EMPTY_CAMPAIGN_FORM,
  parseCampaignForm,
  type CampaignFormValues,
  type CampaignInput,
} from "../lib/campaign-form";
import { CampaignFields } from "./campaign-fields";

const STEPS = ["Campaign Details", "Review"];
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function ReviewItem({
  label,
  onEdit,
  children,
}: {
  label: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-body-sm text-gray-500">
        <h3>{label}</h3>
        <ModalIconButton
          icon={RiPencilLine}
          label={`Edit ${label.toLowerCase()}`}
          onClick={onEdit}
          className="[&_svg]:size-4"
        />
      </div>
      <div className="text-body whitespace-pre-line text-gray-950">{children}</div>
    </section>
  );
}

function CenteredStatus({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 text-center">
      {children}
    </div>
  );
}

/**
 * Creating a campaign: its details, a review, then launch (open) or save as a
 * draft. Launching shows progress until the server confirms, then a success
 * screen that leads to the campaign.
 */
export function CreateCampaignFlow() {
  const router = useRouter();
  const create = useMutation(api.campaigns.create);
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<CampaignFormValues>(EMPTY_CAMPAIGN_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof CampaignFormValues, string>>>({});
  const [input, setInput] = useState<CampaignInput | null>(null);
  const [saving, setSaving] = useState<"open" | "draft" | null>(null);
  const [launched, setLaunched] = useState<Id<"campaigns"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  function next() {
    const parsed = parseCampaignForm(values);
    if (parsed.errors) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setInput(parsed.input);
    setStep(1);
  }

  async function save(status: "open" | "draft") {
    if (input === null || saving !== null) return;
    setSaving(status);
    setError(null);
    try {
      const campaignId = await create({ ...input, status });
      if (status === "draft") router.push("/campaigns");
      else setLaunched(campaignId);
    } catch (caught) {
      setError(
        errorMessage(caught, {
          invalid_state: "Check the campaign's dates and budget, then try again.",
          forbidden: "Only company admins can create campaigns.",
        }),
      );
    } finally {
      setSaving(null);
    }
  }

  if (saving === "open") {
    return (
      <CenteredStatus>
        <Logo type="collapsed" className="animate-pulse text-gray-400" aria-hidden />
        <h1 className="text-heading-sm text-gray-950">Setting your campaign live…</h1>
        <p className="text-body-sm text-gray-500">We’re opening it to creators.</p>
      </CenteredStatus>
    );
  }
  if (launched !== null && input !== null) {
    return (
      <div className="flex min-h-[80vh] flex-col px-4 py-12 sm:px-10">
        <CenteredStatus>
          <span className="flex size-6 items-center justify-center rounded-sm bg-blue-subtle text-primary">
            <RiCheckLine size={16} aria-hidden />
          </span>
          <h1 className="text-heading-sm text-gray-950">{input.title} is live!</h1>
          <p className="text-body-sm text-gray-500">Click continue to view your campaign</p>
        </CenteredStatus>
        <Button
          className="self-end"
          render={<Link href={`/campaigns/${launched}`} />}
          nativeButton={false}
        >
          Continue
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-10">
      <Stepper steps={STEPS} current={step} />
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-heading-md text-gray-950">
            {step === 0 ? "Campaign Details" : "Review"}
          </h1>
          <p className="text-body text-gray-500">
            {step === 0
              ? "Set up your campaign's basic information"
              : "Review campaign information before launching"}
          </p>
        </div>
        <Link
          href="/campaigns"
          aria-label="Cancel and go back to campaigns"
          className="text-gray-500 hover:text-gray-950"
        >
          <RiCloseLine size={24} aria-hidden />
        </Link>
      </header>

      <div className="rounded-lg bg-gray-0 p-8 shadow-card">
        {step === 0 || input === null ? (
          <CampaignFields
            values={values}
            errors={errors}
            onChange={(changes) => setValues((current) => ({ ...current, ...changes }))}
          />
        ) : (
          <div className="flex flex-col gap-6">
            <ReviewItem label="Campaign Name" onEdit={() => setStep(0)}>
              {input.title}
            </ReviewItem>
            <ReviewItem label="Campaign Description" onEdit={() => setStep(0)}>
              {input.description}
            </ReviewItem>
            <ReviewItem label="Budget" onEdit={() => setStep(0)}>
              {formatMoney(input.budgetCents)}
            </ReviewItem>
            <ReviewItem label="Campaign Duration" onEdit={() => setStep(0)}>
              {date.format(input.startsAt)} –{" "}
              {input.endsAt === undefined ? "no end date" : date.format(input.endsAt - 1)}
            </ReviewItem>
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-body-sm text-red-600">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-3">
        {step === 0 ? (
          <Button onClick={next} className="min-w-40">
            Continue
          </Button>
        ) : (
          <>
            <Button
              variant="secondary-subtle"
              onClick={() => setStep(0)}
              disabled={saving !== null}
            >
              Back
            </Button>
            <Button
              variant="secondary-ghost"
              onClick={() => save("draft")}
              disabled={saving !== null}
            >
              {saving === "draft" ? "Saving…" : "Save as Draft"}
            </Button>
            <Button onClick={() => save("open")} disabled={saving !== null} className="min-w-40">
              Launch Campaign
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
