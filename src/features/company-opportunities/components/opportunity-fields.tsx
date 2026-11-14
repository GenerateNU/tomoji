"use client";

import { RiAddLine, RiCalendarLine, RiDeleteBinLine } from "@remixicon/react";
import { useId, useState, type ReactNode } from "react";
import { ModalIconButton } from "@/components/modal";
import { MultiSelectField } from "@/components/multi-select-field";
import { SelectField } from "@/components/select-field";
import { RichTextEditor } from "@/components/rich-text";
import { TextAreaField } from "@/components/text-area-field";
import { TextField } from "@/components/text-field";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { CatalogOptions } from "../hooks/use-catalog-options";
import {
  EMPTY_DELIVERABLE,
  FOLLOWER_RANGES,
  MAX_DELIVERABLES,
  TEXT_LIMITS,
  type DeliverableFormValues,
  type FollowerRange,
  type OpportunityFormErrors,
  type OpportunityFormValues,
} from "../lib/opportunity-form";

export type FieldName = keyof OpportunityFormValues;

export type FieldsProps = {
  values: OpportunityFormValues;
  errors: OpportunityFormErrors;
  onChange: (changes: Partial<OpportunityFormValues>) => void;
  /** Renders only these fields, e.g. one section being edited on the review step. */
  only?: FieldName[];
  /** The campaign's end, which caps the deadline picker. */
  campaignEndsAt?: number;
};

const SLOT_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100];

/** A card section's heading and one-line explanation. */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-6", className)}>
      <header className="flex flex-col gap-1">
        <h2 className="text-body-lg font-medium text-gray-950">{title}</h2>
        <p className="text-body-sm text-gray-500">{description}</p>
      </header>
      {children}
    </section>
  );
}

/** The design's "Allow anyone to claim a spot" switch; on means the opportunity isn't gated. */
export function OpenToAllSwitch({
  checked,
  onCheckedChange,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-4">
      <div className="flex flex-col sm:text-right">
        <span id={`${id}-label`} className="text-body-sm font-medium text-gray-950">
          Allow anyone to claim a spot
        </span>
        <span id={`${id}-hint`} className="text-body-xs text-gray-500">
          {checked
            ? "Anyone will be able to claim a spot"
            : "Creators apply and you choose who joins"}
        </span>
      </div>
      <Switch
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}

function toDateInput(timestamp: number): string {
  const day = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** Name, description, deadline, and who can claim a spot. */
export function DetailsFields({ values, errors, onChange, only, campaignEndsAt }: FieldsProps) {
  const [today] = useState(() => toDateInput(Date.now()));
  const show = (field: FieldName) => only === undefined || only.includes(field);
  return (
    <div className="flex flex-col gap-6">
      {(show("title") || show("isOpenToAll")) && (
        <div className="flex flex-col-reverse gap-6 sm:flex-row sm:items-start sm:justify-between">
          {show("title") && (
            <TextField
              label="Opportunity Name"
              placeholder="Opportunity Name"
              value={values.title}
              onChange={(event) => onChange({ title: event.target.value })}
              error={errors.title}
              className="w-full max-w-sm"
            />
          )}
          {show("isOpenToAll") && (
            <OpenToAllSwitch
              checked={values.isOpenToAll}
              onCheckedChange={(isOpenToAll) => onChange({ isOpenToAll })}
            />
          )}
        </div>
      )}
      {show("description") && (
        <TextAreaField
          label="Opportunity Description"
          placeholder="Provide a description for your campaign’s opportunity..."
          maxLength={TEXT_LIMITS.description}
          value={values.description}
          onChange={(event) => onChange({ description: event.target.value })}
          error={errors.description}
        />
      )}
      {show("deadlineDate") && (
        <TextField
          label="Deadline"
          type="date"
          icon={RiCalendarLine}
          min={today}
          max={campaignEndsAt === undefined ? undefined : toDateInput(campaignEndsAt - 1)}
          value={values.deadlineDate}
          onChange={(event) => onChange({ deadlineDate: event.target.value })}
          error={errors.deadlineDate}
          helper="The opportunity closes at the end of this day."
          className="max-w-sm"
        />
      )}
    </div>
  );
}

function DeliverableCard({
  index,
  deliverable,
  errors,
  onChange,
  onRemove,
}: {
  index: number;
  deliverable: DeliverableFormValues;
  errors: OpportunityFormErrors;
  onChange: (changes: Partial<DeliverableFormValues>) => void;
  onRemove?: () => void;
}) {
  const key = (field: keyof DeliverableFormValues) => errors[`deliverables.${index}.${field}`];
  return (
    <li className="flex flex-col gap-4 rounded border border-gray-100 p-4">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-body-sm font-medium text-gray-500">Deliverable {index + 1}</h3>
        {onRemove && (
          <ModalIconButton
            icon={RiDeleteBinLine}
            label={`Remove deliverable ${index + 1}`}
            onClick={onRemove}
            className="[&_svg]:size-4"
          />
        )}
      </div>
      <TextField
        label="Title"
        placeholder="e.g. X thread about your build"
        maxLength={TEXT_LIMITS.deliverableTitle}
        value={deliverable.title}
        onChange={(event) => onChange({ title: event.target.value })}
        error={key("title")}
        className="max-w-md"
      />
      <TextAreaField
        label="What to make"
        placeholder="Describe the post, its format, and anything it must show..."
        rows={3}
        showCount={false}
        maxLength={TEXT_LIMITS.deliverableDescription}
        value={deliverable.description}
        onChange={(event) => onChange({ description: event.target.value })}
        error={key("description")}
      />
      <TextAreaField
        label="Review criteria"
        placeholder="e.g. Shows the app running"
        rows={3}
        showCount={false}
        value={deliverable.criteria}
        onChange={(event) => onChange({ criteria: event.target.value })}
        error={key("criteria")}
        helper="Optional. One per line. AI review checks submissions against these."
      />
    </li>
  );
}

/** What creators must post, and each piece of content they owe. */
export function DeliverablesFields({ values, errors, onChange }: FieldsProps) {
  const update = (index: number, changes: Partial<DeliverableFormValues>) =>
    onChange({
      deliverables: values.deliverables.map((deliverable, at) =>
        at === index ? { ...deliverable, ...changes } : deliverable,
      ),
    });
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-4">
        {values.deliverables.map((deliverable, index) => (
          <DeliverableCard
            key={index}
            index={index}
            deliverable={deliverable}
            errors={errors}
            onChange={(changes) => update(index, changes)}
            onRemove={
              values.deliverables.length > 1
                ? () =>
                    onChange({ deliverables: values.deliverables.filter((_, at) => at !== index) })
                : undefined
            }
          />
        ))}
      </ol>
      {errors.deliverables && (
        <p role="alert" className="text-body-sm text-red-600">
          {errors.deliverables}
        </p>
      )}
      {values.deliverables.length < MAX_DELIVERABLES && (
        <Button
          variant="secondary-subtle"
          size="sm"
          className="self-start"
          onClick={() =>
            onChange({ deliverables: [...values.deliverables, { ...EMPTY_DELIVERABLE }] })
          }
        >
          <RiAddLine aria-hidden />
          Add deliverable
        </Button>
      )}
    </div>
  );
}

/** Content requirements, slots, the product link, and (unless `only` says otherwise) deliverables. */
export function RequirementsFields(props: FieldsProps) {
  const { values, errors, onChange, only } = props;
  const show = (field: FieldName) => only === undefined || only.includes(field);
  const slots = new Set(SLOT_CHOICES);
  if (/^[1-9]\d*$/.test(values.maxSlots)) slots.add(Number(values.maxSlots));
  return (
    <div className="flex flex-col gap-6">
      {show("contentRequirements") && (
        <RichTextEditor
          label="Requirements + Guidelines"
          placeholder="What should creators make, and how?"
          value={values.contentRequirements}
          onChange={(contentRequirements) => onChange({ contentRequirements })}
          error={errors.contentRequirements}
          helper="Use lists for separate requirements. Links must start with https://."
        />
      )}
      {show("productAccessLink") && (
        <TextField
          label="Product access link"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={values.productAccessLink}
          onChange={(event) => onChange({ productAccessLink: event.target.value })}
          error={errors.productAccessLink}
          helper="Optional. Where creators get the product, shared once they join."
          className="max-w-md"
        />
      )}
      {show("maxSlots") && (
        <SelectField
          label="Slots"
          placeholder="Select number of slots available"
          options={[...slots]
            .sort((a, b) => a - b)
            .map((count) => ({ value: String(count), label: String(count) }))}
          value={values.maxSlots === "" ? null : values.maxSlots}
          onValueChange={(next) => onChange({ maxSlots: next ?? "" })}
          error={errors.maxSlots}
          className="max-w-xs"
        />
      )}
      {show("deliverables") && <DeliverablesFields {...props} />}
    </div>
  );
}

/** Who the opportunity is for: niches, skills, languages, and a minimum reach. */
export function EligibilityFields({
  values,
  errors,
  onChange,
  catalog,
}: FieldsProps & { catalog: CatalogOptions }) {
  const multi = (
    field: "niches" | "skills" | "languages",
    label: string,
    options: CatalogOptions["niches"],
  ) => (
    <MultiSelectField
      label={label}
      placeholder={options === undefined ? "Loading…" : `Select one or more ${label.toLowerCase()}`}
      searchPlaceholder={`Search ${label.toLowerCase()}`}
      options={options ?? []}
      disabled={options === undefined}
      value={values[field]}
      onValueChange={(next) => onChange({ [field]: next })}
      error={errors[field]}
      helper="Optional. Up to 5."
      className="max-w-md"
    />
  );
  return (
    <div className="flex flex-col gap-6">
      {multi("niches", "Niches", catalog.niches)}
      {multi("skills", "Skills", catalog.skills)}
      {multi("languages", "Languages", catalog.languages)}
      <SelectField
        label="Followers"
        placeholder="Select range of followers"
        options={[{ value: "none", label: "No minimum" }, ...FOLLOWER_RANGES]}
        value={values.minFollowerRange === "" ? null : values.minFollowerRange}
        onValueChange={(next) =>
          onChange({
            minFollowerRange: next === null || next === "none" ? "" : (next as FollowerRange),
          })
        }
        error={errors.minFollowerRange}
        helper="The smallest audience you want. Smaller creators are ranked lower, not hidden."
        className="max-w-md"
      />
    </div>
  );
}

/** Base payment, CPM, and the per-creator cap. */
export function CompensationFields({ values, errors, onChange, only }: FieldsProps) {
  const show = (field: FieldName) => only === undefined || only.includes(field);
  const unit = (text: string) => (
    <span className="text-body-xs whitespace-nowrap text-gray-500">{text}</span>
  );
  return (
    <div className="flex flex-col gap-6">
      {show("fixedFee") && (
        <TextField
          label="Base Payment"
          inputMode="decimal"
          placeholder="0.00"
          trailing={unit("USD")}
          value={values.fixedFee}
          onChange={(event) => onChange({ fixedFee: event.target.value })}
          error={errors.fixedFee}
          helper="Flat fee paid to each creator for publishing approved content, regardless of performance."
          className="max-w-sm"
        />
      )}
      {show("cpmRate") && (
        <TextField
          label="CPM"
          inputMode="decimal"
          placeholder="0.00"
          trailing={unit("per 1K views")}
          value={values.cpmRate}
          onChange={(event) => onChange({ cpmRate: event.target.value })}
          error={errors.cpmRate}
          helper="Additional amount paid for every 1,000 views the content earns."
          className="max-w-sm"
        />
      )}
      {show("paymentCap") && (
        <TextField
          label="Cap"
          inputMode="decimal"
          placeholder="0.00"
          trailing={unit("per creator")}
          value={values.paymentCap}
          onChange={(event) => onChange({ paymentCap: event.target.value })}
          error={errors.paymentCap}
          helper="Maximum total payout per creator, including base payment and CPM earnings. Leave empty for no cap."
          className="max-w-sm"
        />
      )}
    </div>
  );
}

/** The review policy creators read, and whether AI reviews submissions by default. */
export function PolicyFields({ values, errors, onChange, only }: FieldsProps) {
  const show = (field: FieldName) => only === undefined || only.includes(field);
  const id = useId();
  return (
    <div className="flex flex-col gap-6">
      {show("reviewPolicy") && (
        <RichTextEditor
          label="Content Review Policy"
          value={values.reviewPolicy}
          onChange={(reviewPolicy) => onChange({ reviewPolicy })}
          error={errors.reviewPolicy}
          helper="Creators see this before they apply."
        />
      )}
      {show("usesAiReview") && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-4 sm:justify-start">
            <div className="flex flex-col">
              <span id={`${id}-label`} className="text-body-sm font-medium text-gray-950">
                Review submissions with AI first
              </span>
              <span id={`${id}-hint`} className="text-body-xs text-gray-500">
                AI checks each submission against its deliverable’s criteria before you do.
              </span>
            </div>
            <Switch
              aria-labelledby={`${id}-label`}
              aria-describedby={`${id}-hint`}
              aria-invalid={errors.usesAiReview ? true : undefined}
              checked={values.usesAiReview}
              onCheckedChange={(usesAiReview) => onChange({ usesAiReview })}
            />
          </div>
          {errors.usesAiReview && (
            <p role="alert" className="text-body-sm text-red-600">
              {errors.usesAiReview}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
