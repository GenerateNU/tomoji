import type { api } from "@convex/_generated/api";
import type { Doc } from "@convex/_generated/dataModel";
import type { FunctionArgs } from "convex/server";

/** What `opportunities.create` takes, less what the flow decides on its own. */
export type OpportunityInput = Omit<
  FunctionArgs<typeof api.opportunities.create>,
  "campaignId" | "status"
>;

export type FollowerRange = NonNullable<Doc<"opportunities">["minFollowerRange"]>;

export type DeliverableFormValues = {
  title: string;
  description: string;
  /** One review criterion per line. */
  criteria: string;
};

/** What the opportunity form edits, as the inputs hold it. */
export type OpportunityFormValues = {
  title: string;
  description: string;
  /** `yyyy-mm-dd` in the viewer's time zone. */
  deadlineDate: string;
  /** The design's "Allow anyone to claim a spot": the inverse of `isGated`. */
  isOpenToAll: boolean;
  /** One requirement per line. */
  contentRequirements: string;
  maxSlots: string;
  productAccessLink: string;
  niches: string[];
  skills: string[];
  languages: string[];
  /** A follower range, or "" for no minimum. */
  minFollowerRange: FollowerRange | "";
  /** Dollars, as typed. */
  fixedFee: string;
  cpmRate: string;
  paymentCap: string;
  reviewPolicy: string;
  usesAiReview: boolean;
  deliverables: DeliverableFormValues[];
};

/** Field errors, keyed by field name, or `deliverables.<index>.<field>`. */
export type OpportunityFormErrors = Partial<Record<string, string>>;

export type OpportunityStep = "details" | "requirements" | "compensation" | "policy";

export const TEXT_LIMITS = {
  description: 1000,
  contentRequirements: 1000,
  reviewPolicy: 3000,
  deliverableTitle: 200,
  deliverableDescription: 5000,
} as const;
/** Backend caps per selection list and per deliverable. */
export const MAX_SELECTIONS = 5;
export const MAX_DELIVERABLES = 20;
const MAX_CRITERIA = 20;

export const FOLLOWER_RANGES: { value: FollowerRange; label: string }[] = [
  { value: "under-1k", label: "Under 1K" },
  { value: "1k-5k", label: "1K – 5K" },
  { value: "5k-10k", label: "5K – 10K" },
  { value: "10k-50k", label: "10K – 50K" },
  { value: "50k-100k", label: "50K – 100K" },
  { value: "100k-500k", label: "100K – 500K" },
  { value: "500k-plus", label: "500K+" },
];

export const DEFAULT_REVIEW_POLICY = `All creator submissions are reviewed before they're approved for posting and payment. We aim to review each submission within 3 business days.
What we check
- The content describes the product accurately and makes no claims we haven't confirmed.
- Required disclosures (#ad, #sponsored, or the platform's paid-partnership label) are clearly visible.
- The content meets every requirement of this opportunity.
- There's no misleading, offensive, or unlicensed material.
Review outcomes
- Approved: you can post the content.
- Changes requested: we'll explain what needs fixing.
- Rejected: the content doesn't meet the policy and isn't eligible for payment. We'll tell you why.`;

export const EMPTY_DELIVERABLE: DeliverableFormValues = {
  title: "",
  description: "",
  criteria: "",
};

export const EMPTY_OPPORTUNITY_FORM: OpportunityFormValues = {
  title: "",
  description: "",
  deadlineDate: "",
  isOpenToAll: false,
  contentRequirements: "",
  maxSlots: "",
  productAccessLink: "",
  niches: [],
  skills: [],
  languages: [],
  minFollowerRange: "",
  fixedFee: "",
  cpmRate: "",
  paymentCap: "",
  reviewPolicy: DEFAULT_REVIEW_POLICY,
  usesAiReview: false,
  deliverables: [EMPTY_DELIVERABLE],
};

const HALF_HOUR = 1_800_000;
const DAY = 86_400_000;
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

function startOfDay(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
}

/**
 * The end of the chosen local day, on the half-hour UTC grid the backend
 * requires (rounding only matters in time zones with a :15 or :45 offset).
 */
export function deadlineFromDate(value: string): number {
  return Math.round((startOfDay(value) + DAY) / HALF_HOUR) * HALF_HOUR;
}

function toDateInput(timestamp: number): string {
  const day = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** The last full day before `deadline`, as the date input shows it. */
export function dateFromDeadline(deadline: number): string {
  return toDateInput(deadline - 1);
}

const MONEY = /^\d+(\.\d{1,2})?$/;

function parseCents(value: string): number | null {
  const trimmed = value.trim().replace(/^\$/, "").replaceAll(",", "");
  if (trimmed === "") return 0;
  return MONEY.test(trimmed) ? Math.round(Number(trimmed) * 100) : null;
}

function lines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

type Context = {
  now: number;
  /** The campaign's end, when it has one: no deadline may fall after it. */
  campaignEndsAt?: number;
};

const STEP_FIELDS: Record<OpportunityStep, (keyof OpportunityFormValues)[]> = {
  details: ["title", "description", "deadlineDate", "isOpenToAll"],
  requirements: [
    "contentRequirements",
    "maxSlots",
    "deliverables",
    "productAccessLink",
    "niches",
    "skills",
    "languages",
    "minFollowerRange",
  ],
  compensation: ["fixedFee", "cpmRate", "paymentCap"],
  policy: ["reviewPolicy", "usesAiReview"],
};

/** The step a field is edited on, so an error can send the user back to it. */
export function stepOfField(field: string): OpportunityStep {
  const name = field.split(".")[0] as keyof OpportunityFormValues;
  return (Object.keys(STEP_FIELDS) as OpportunityStep[]).find((step) =>
    STEP_FIELDS[step].includes(name),
  )!;
}

/** Checks one step's fields, returning a message per problem. */
export function validateOpportunityStep(
  values: OpportunityFormValues,
  step: OpportunityStep,
  { now, campaignEndsAt }: Context,
): OpportunityFormErrors {
  const errors: OpportunityFormErrors = {};
  if (step === "details") {
    if (values.title.trim() === "") errors.title = "Give the opportunity a name.";
    if (values.description.trim() === "") errors.description = "Describe the opportunity.";
    if (values.deadlineDate === "") {
      errors.deadlineDate = "Pick the last day creators can take part.";
    } else {
      const deadline = deadlineFromDate(values.deadlineDate);
      if (deadline <= now) errors.deadlineDate = "Pick a date from today on.";
      else if (campaignEndsAt !== undefined && deadline > campaignEndsAt) {
        errors.deadlineDate = `The campaign ends ${date.format(campaignEndsAt - 1)}; pick a date on or before it.`;
      }
    }
  }
  if (step === "requirements") {
    if (values.contentRequirements.trim() === "") {
      errors.contentRequirements = "List what creators' content must include.";
    }
    if (!/^[1-9]\d*$/.test(values.maxSlots)) errors.maxSlots = "Choose how many creators can join.";
    if (values.deliverables.length === 0) errors.deliverables = "Add at least one deliverable.";
    values.deliverables.forEach((deliverable, index) => {
      if (deliverable.title.trim() === "") {
        errors[`deliverables.${index}.title`] = "Name the deliverable.";
      }
      if (deliverable.description.trim() === "") {
        errors[`deliverables.${index}.description`] = "Describe what to make.";
      }
      if (lines(deliverable.criteria).length > MAX_CRITERIA) {
        errors[`deliverables.${index}.criteria`] = `Use at most ${MAX_CRITERIA} criteria.`;
      }
    });
    for (const field of ["niches", "skills", "languages"] as const) {
      if (values[field].length > MAX_SELECTIONS) {
        errors[field] = `Choose at most ${MAX_SELECTIONS}.`;
      }
    }
    const link = values.productAccessLink.trim();
    if (link !== "" && !isWebAddress(link)) {
      errors.productAccessLink = "Enter a full web address, like https://example.com.";
    }
  }
  if (step === "compensation") {
    if (parseCents(values.fixedFee) === null)
      errors.fixedFee = "Enter dollars, like 300 or 300.00.";
    if (parseCents(values.cpmRate) === null) errors.cpmRate = "Enter dollars, like 3 or 3.50.";
    if (parseCents(values.paymentCap) === null) {
      errors.paymentCap = "Enter dollars, like 2000 or 2000.00.";
    }
  }
  if (step === "policy") {
    if (values.reviewPolicy.trim() === "") {
      errors.reviewPolicy = "Tell creators how their content will be reviewed.";
    }
    if (values.usesAiReview && values.deliverables.some((d) => lines(d.criteria).length === 0)) {
      errors.usesAiReview =
        "AI review checks each deliverable against its criteria. Add criteria to every deliverable, or turn this off.";
    }
  }
  return errors;
}

/** Checks every step and converts the form to the backend's shape, or returns a message per field. */
export function parseOpportunityForm(
  values: OpportunityFormValues,
  context: Context,
):
  | { input: OpportunityInput; errors?: undefined }
  | { input?: undefined; errors: OpportunityFormErrors } {
  const errors = validateAll(values, context);
  return Object.keys(errors).length > 0 ? { errors } : { input: toInput(values) };
}

function validateAll(values: OpportunityFormValues, context: Context): OpportunityFormErrors {
  return Object.assign(
    {},
    ...(Object.keys(STEP_FIELDS) as OpportunityStep[]).map((step) =>
      validateOpportunityStep(values, step, context),
    ),
  ) as OpportunityFormErrors;
}

/** What `opportunities.update` takes besides the id: only the fields being changed. */
export type OpportunityUpdate = Omit<
  FunctionArgs<typeof api.opportunities.update>,
  "opportunityId"
>;

/**
 * Checks an edited brief and returns only what changed from `original`, as
 * `opportunities.update` takes it: an emptied link or follower minimum is
 * `null`. Deliverables aren't part of the brief, so they aren't checked.
 */
export function parseOpportunityUpdate(
  values: OpportunityFormValues,
  original: OpportunityFormValues,
  context: Context,
):
  | { updates: OpportunityUpdate; errors?: undefined }
  | { updates?: undefined; errors: OpportunityFormErrors } {
  const errors = Object.fromEntries(
    Object.entries(validateAll({ ...values, deliverables: [] }, context)).filter(
      ([field]) => !field.startsWith("deliverables"),
    ),
  );
  if (Object.keys(errors).length > 0) return { errors };
  const { deliverables: _next, ...next } = toInput({ ...values, deliverables: [] });
  const { deliverables: _before, ...before } = toInput({ ...original, deliverables: [] });
  const updates: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(next), ...Object.keys(before)])) {
    const after = next[key as keyof typeof next];
    if (JSON.stringify(after) !== JSON.stringify(before[key as keyof typeof before])) {
      updates[key] = after ?? null;
    }
  }
  return { updates: updates as OpportunityUpdate };
}

function toInput(values: OpportunityFormValues): OpportunityInput {
  const link = values.productAccessLink.trim();
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    isGated: !values.isOpenToAll,
    usesAiReviewDefault: values.usesAiReview,
    maxSlots: Number(values.maxSlots),
    deadline: deadlineFromDate(values.deadlineDate),
    fixedFeeCents: parseCents(values.fixedFee)!,
    cpmRateCents: parseCents(values.cpmRate)!,
    paymentCapCents: parseCents(values.paymentCap)!,
    contentRequirements: values.contentRequirements.trim(),
    reviewPolicy: values.reviewPolicy.trim(),
    ...(link === "" ? {} : { productAccessLink: link }),
    ...(values.minFollowerRange === "" ? {} : { minFollowerRange: values.minFollowerRange }),
    niches: values.niches,
    skills: values.skills,
    languages: values.languages,
    deliverables: values.deliverables.map((deliverable) => {
      const criteria = lines(deliverable.criteria);
      return {
        title: deliverable.title.trim(),
        description: deliverable.description.trim(),
        ...(criteria.length === 0
          ? {}
          : {
              // Ids only need to be unique within the deliverable.
              reviewCriteria: criteria.map((description, index) => ({
                id: `criterion-${index + 1}`,
                description,
              })),
            }),
      };
    }),
  };
}

const dollars = (cents: number) => (cents / 100).toFixed(2);

/** Pre-fills the form from a saved brief. Deliverables aren't part of it; they change separately. */
export function opportunityFormValues(
  opportunity: Omit<OpportunityInput, "deliverables">,
): OpportunityFormValues {
  return {
    title: opportunity.title,
    description: opportunity.description,
    deadlineDate: dateFromDeadline(opportunity.deadline),
    isOpenToAll: !opportunity.isGated,
    contentRequirements: opportunity.contentRequirements,
    maxSlots: String(opportunity.maxSlots),
    productAccessLink: opportunity.productAccessLink ?? "",
    niches: opportunity.niches ?? [],
    skills: opportunity.skills ?? [],
    languages: opportunity.languages ?? [],
    minFollowerRange: opportunity.minFollowerRange ?? "",
    fixedFee: dollars(opportunity.fixedFeeCents),
    cpmRate: dollars(opportunity.cpmRateCents),
    paymentCap: dollars(opportunity.paymentCapCents),
    reviewPolicy: opportunity.reviewPolicy,
    usesAiReview: opportunity.usesAiReviewDefault,
    deliverables: [],
  };
}
