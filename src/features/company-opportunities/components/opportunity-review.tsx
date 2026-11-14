"use client";

import { RichText } from "@/components/rich-text";
import { RiCheckLine, RiPencilLine } from "@remixicon/react";
import { useState, type ReactNode } from "react";
import { ModalIconButton } from "@/components/modal";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";
import { labelOf, type CatalogOptions } from "../hooks/use-catalog-options";
import {
  stepOfField,
  validateOpportunityStep,
  type OpportunityFormErrors,
  type OpportunityFormValues,
  type OpportunityInput,
} from "../lib/opportunity-form";
import {
  CompensationFields,
  DeliverablesFields,
  DetailsFields,
  EligibilityFields,
  OpenToAllSwitch,
  PolicyFields,
  RequirementsFields,
  type FieldName,
  type FieldsProps,
} from "./opportunity-fields";
import { slotsAndReach } from "./opportunity-preview";

const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

type Section = {
  id: string;
  label: string;
  fields: FieldName[];
  view: ReactNode;
  edit: ReactNode;
};

function ReviewSection({
  section,
  editing,
  onEdit,
  onDone,
}: {
  section: Section;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
}) {
  const name = section.label.toLowerCase();
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2 text-body-sm text-gray-500">
        <h3>{section.label}</h3>
        {editing ? (
          <ModalIconButton
            icon={RiCheckLine}
            label={`Done editing ${name}`}
            onClick={onDone}
            className="text-primary hover:text-primary [&_svg]:size-4"
          />
        ) : (
          <ModalIconButton
            icon={RiPencilLine}
            label={`Edit ${name}`}
            onClick={onEdit}
            className="[&_svg]:size-4"
          />
        )}
      </div>
      {editing ? section.edit : <div className="text-body text-gray-950">{section.view}</div>}
    </section>
  );
}

function TagGroup({
  label,
  names,
  options,
}: {
  label: string;
  names: string[];
  options: CatalogOptions["niches"];
}) {
  if (names.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-body-xs text-gray-500">{label}</p>
      <ul className="flex flex-wrap gap-1.5">
        {names.map((name) => (
          <li key={name}>
            <Badge>{labelOf(options, name)}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Every answer on one page, each section editable in place. `input` is the
 * last valid form; a section only closes once its fields check out.
 */
export function OpportunityReview({
  values,
  errors,
  onChange,
  onErrors,
  input,
  catalog,
  campaignEndsAt,
  editing,
  onEditingChange,
}: {
  values: OpportunityFormValues;
  errors: OpportunityFormErrors;
  onChange: FieldsProps["onChange"];
  onErrors: (errors: OpportunityFormErrors) => void;
  input: OpportunityInput;
  catalog: CatalogOptions;
  campaignEndsAt?: number;
  /** Ids of the sections open for editing. */
  editing: string[];
  onEditingChange: (editing: string[]) => void;
}) {
  const [now] = useState(() => Date.now());
  const props: FieldsProps = { values, errors, onChange, campaignEndsAt };
  const sections: Section[] = [
    {
      id: "description",
      label: "Opportunity Description",
      fields: ["description"],
      view: <p className="whitespace-pre-line">{input.description}</p>,
      edit: <DetailsFields {...props} only={["description"]} />,
    },
    {
      id: "deadline",
      label: "Deadline",
      fields: ["deadlineDate"],
      view: date.format(input.deadline - 1),
      edit: <DetailsFields {...props} only={["deadlineDate"]} />,
    },
    {
      id: "contentRequirements",
      label: "Requirements + Guidelines",
      fields: ["contentRequirements"],
      view: <RichText markdown={input.contentRequirements} />,
      edit: <RequirementsFields {...props} only={["contentRequirements"]} />,
    },
    {
      id: "deliverables",
      label: "Deliverables",
      fields: ["deliverables"],
      view: (
        <ol className="flex flex-col gap-3">
          {input.deliverables?.map((deliverable, index) => (
            <li key={index} className="flex flex-col gap-0.5">
              <span className="font-medium">{deliverable.title}</span>
              <span className="whitespace-pre-line text-gray-700">{deliverable.description}</span>
              {deliverable.reviewCriteria && (
                <span className="text-body-sm text-gray-500">
                  {deliverable.reviewCriteria.length} review{" "}
                  {deliverable.reviewCriteria.length === 1 ? "criterion" : "criteria"}
                </span>
              )}
            </li>
          ))}
        </ol>
      ),
      edit: <DeliverablesFields {...props} />,
    },
    {
      id: "eligibility",
      label: "Eligibility",
      fields: ["maxSlots", "niches", "skills", "languages", "minFollowerRange"],
      view: (
        <div className="flex flex-col gap-4">
          <TagGroup label="Niches" names={input.niches ?? []} options={catalog.niches} />
          <TagGroup label="Skills" names={input.skills ?? []} options={catalog.skills} />
          <TagGroup label="Languages" names={input.languages ?? []} options={catalog.languages} />
          <p className="text-body-sm">{slotsAndReach(input)}</p>
        </div>
      ),
      edit: (
        <div className="flex flex-col gap-6">
          <RequirementsFields {...props} only={["maxSlots"]} />
          <EligibilityFields {...props} catalog={catalog} />
        </div>
      ),
    },
    {
      id: "productAccessLink",
      label: "Product Access Link",
      fields: ["productAccessLink"],
      view: input.productAccessLink ?? <span className="text-gray-500">None</span>,
      edit: <RequirementsFields {...props} only={["productAccessLink"]} />,
    },
    {
      id: "fixedFee",
      label: "Base Payment",
      fields: ["fixedFee"],
      view: formatMoney(input.fixedFeeCents),
      edit: <CompensationFields {...props} only={["fixedFee"]} />,
    },
    {
      id: "cpmRate",
      label: "CPM",
      fields: ["cpmRate"],
      view: `${formatMoney(input.cpmRateCents)} per 1K views`,
      edit: <CompensationFields {...props} only={["cpmRate"]} />,
    },
    {
      id: "paymentCap",
      label: "Cap",
      fields: ["paymentCap"],
      view:
        input.paymentCapCents > 0 ? `${formatMoney(input.paymentCapCents)} per creator` : "No cap",
      edit: <CompensationFields {...props} only={["paymentCap"]} />,
    },
    {
      id: "reviewPolicy",
      label: "Content Review Policy",
      fields: ["reviewPolicy", "usesAiReview"],
      view: (
        <div className="flex flex-col gap-3">
          <RichText markdown={input.reviewPolicy} />
          <p className="text-body-sm text-gray-500">
            {input.usesAiReviewDefault
              ? "AI reviews submissions first."
              : "You review every submission yourself."}
          </p>
        </div>
      ),
      edit: <PolicyFields {...props} />,
    },
  ];

  function done(section: Section) {
    const steps = new Set(section.fields.map(stepOfField));
    const found: OpportunityFormErrors = {};
    for (const step of steps) {
      for (const [key, message] of Object.entries(
        validateOpportunityStep(values, step, { now, campaignEndsAt }),
      )) {
        if (section.fields.includes(key.split(".")[0] as FieldName)) found[key] = message;
      }
    }
    onErrors(found);
    if (Object.keys(found).length === 0) {
      onEditingChange(editing.filter((id) => id !== section.id));
    }
  }

  const nameSection: Section = {
    id: "title",
    label: "Opportunity Name",
    fields: ["title"],
    view: input.title,
    edit: <DetailsFields {...props} only={["title"]} />,
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
        <ReviewSection
          section={nameSection}
          editing={editing.includes("title")}
          onEdit={() => onEditingChange([...editing, "title"])}
          onDone={() => done(nameSection)}
        />
        <OpenToAllSwitch
          checked={values.isOpenToAll}
          onCheckedChange={(isOpenToAll) => onChange({ isOpenToAll })}
        />
      </div>
      {sections.map((section) => (
        <ReviewSection
          key={section.id}
          section={section}
          editing={editing.includes(section.id)}
          onEdit={() => onEditingChange([...editing, section.id])}
          onDone={() => done(section)}
        />
      ))}
    </div>
  );
}

/** The review sections a field belongs to, for opening the ones a failed launch points at. */
export function reviewSectionOf(field: string): string {
  const name = field.split(".")[0];
  const map: Record<string, string> = {
    deadlineDate: "deadline",
    maxSlots: "eligibility",
    niches: "eligibility",
    skills: "eligibility",
    languages: "eligibility",
    minFollowerRange: "eligibility",
    usesAiReview: "reviewPolicy",
  };
  return map[name] ?? name;
}
