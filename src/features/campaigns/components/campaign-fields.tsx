"use client";

import { RiCalendarLine } from "@remixicon/react";
import { TextAreaField } from "@/components/text-area-field";
import { TextField } from "@/components/text-field";
import { DESCRIPTION_MAX_LENGTH, type CampaignFormValues } from "../lib/campaign-form";

/** The campaign's name, description, budget, and dates, shared by creating and editing. */
export function CampaignFields({
  values,
  errors,
  onChange,
}: {
  values: CampaignFormValues;
  errors: Partial<Record<keyof CampaignFormValues, string>>;
  onChange: (changes: Partial<CampaignFormValues>) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      <TextField
        label="Campaign Name"
        placeholder="Campaign Name"
        value={values.title}
        onChange={(event) => onChange({ title: event.target.value })}
        error={errors.title}
        className="max-w-sm"
      />
      <TextAreaField
        label="Campaign Description"
        placeholder="Provide a description for your campaign..."
        maxLength={DESCRIPTION_MAX_LENGTH}
        value={values.description}
        onChange={(event) => onChange({ description: event.target.value })}
        error={errors.description}
      />
      <TextField
        label="Budget"
        inputMode="decimal"
        placeholder="5000.00"
        trailing={<span className="text-body text-gray-500">USD</span>}
        value={values.budget}
        onChange={(event) => onChange({ budget: event.target.value })}
        error={errors.budget}
        helper="The most you plan to spend across this campaign's opportunities."
        className="max-w-sm"
      />
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-body-sm font-medium text-gray-500">Campaign Duration</legend>
        <TextField
          label="Start Date"
          type="date"
          icon={RiCalendarLine}
          value={values.startDate}
          onChange={(event) => onChange({ startDate: event.target.value })}
          error={errors.startDate}
          className="max-w-sm"
        />
        <TextField
          label="End Date"
          type="date"
          icon={RiCalendarLine}
          min={values.startDate || undefined}
          value={values.endDate}
          onChange={(event) => onChange({ endDate: event.target.value })}
          error={errors.endDate}
          helper="Optional. The campaign closes at the end of this day."
          className="max-w-sm"
        />
      </fieldset>
    </div>
  );
}
