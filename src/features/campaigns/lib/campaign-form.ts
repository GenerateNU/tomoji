import type { Doc } from "@convex/_generated/dataModel";

/** What the campaign form edits, as the inputs hold it. */
export type CampaignFormValues = {
  title: string;
  description: string;
  /** Dollars, as typed. */
  budget: string;
  /** `yyyy-mm-dd` in the viewer's time zone. */
  startDate: string;
  endDate: string;
};

export type CampaignInput = Pick<
  Doc<"campaigns">,
  "title" | "description" | "budgetCents" | "startsAt" | "endsAt"
>;

export const DESCRIPTION_MAX_LENGTH = 1000;
const HALF_HOUR = 1_800_000;

export const EMPTY_CAMPAIGN_FORM: CampaignFormValues = {
  title: "",
  description: "",
  budget: "",
  startDate: "",
  endDate: "",
};

function toDateInput(timestamp: number): string {
  const day = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

function startOfDay(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
}

/** Pre-fills the form from a saved campaign; an end is shown as its last full day. */
export function campaignFormValues(campaign: CampaignInput): CampaignFormValues {
  return {
    title: campaign.title,
    description: campaign.description,
    budget: (campaign.budgetCents / 100).toFixed(2),
    startDate: toDateInput(campaign.startsAt),
    endDate: campaign.endsAt === undefined ? "" : toDateInput(campaign.endsAt - 1),
  };
}

/**
 * Checks the form and converts it to the backend's shape, or returns a
 * message per field. A campaign starts at the beginning of its start date and
 * ends at the end of its end date, on the half-hour grid the backend requires.
 */
export function parseCampaignForm(
  values: CampaignFormValues,
):
  | { input: CampaignInput; errors?: undefined }
  | { input?: undefined; errors: Partial<Record<keyof CampaignFormValues, string>> } {
  const errors: Partial<Record<keyof CampaignFormValues, string>> = {};
  if (values.title.trim() === "") errors.title = "Give the campaign a name.";
  if (values.description.trim() === "") errors.description = "Describe the campaign.";
  if (!/^\d+(\.\d{1,2})?$/.test(values.budget.trim())) {
    errors.budget = "Enter a budget in dollars, like 5000 or 5000.00.";
  }
  if (values.startDate === "") errors.startDate = "Pick a start date.";
  const startsAt = values.startDate === "" ? NaN : startOfDay(values.startDate);
  const endsAt =
    values.endDate === ""
      ? undefined
      : Math.round((startOfDay(values.endDate) + 86_400_000) / HALF_HOUR) * HALF_HOUR;
  if (endsAt !== undefined && Number.isFinite(startsAt) && endsAt <= startsAt) {
    errors.endDate = "The end date can't be before the start date.";
  }
  if (Object.keys(errors).length > 0) return { errors };
  return {
    input: {
      title: values.title.trim(),
      description: values.description.trim(),
      budgetCents: Math.round(Number(values.budget.trim()) * 100),
      startsAt,
      endsAt,
    },
  };
}
