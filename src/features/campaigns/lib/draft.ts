import type { FunctionArgs } from "convex/server";
import type { api } from "@convex/_generated/api";

export const briefFields = {
  title: "Campaign name",
  objective: "Objective",
  product: "Product",
  audience: "Audience",
  description: "Description",
} as const;

/** Parses explicit UTC input without silently normalizing impossible calendar dates. */
function utcDate(value: string): number {
  const timestamp = Date.parse(`${value}Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 16) !== value
  )
    throw new Error("Enter a valid UTC date and time.");
  return timestamp;
}

/** Converts form-only strings to the existing create contract, never defaulting to an open campaign. */
export function parseCampaignDraft(data: FormData): FunctionArgs<typeof api.campaigns.create> {
  const text = (name: string) => String(data.get(name) ?? "").trim();
  const brief = Object.fromEntries(
    Object.entries(briefFields).map(([name, label]) => {
      const value = text(name);
      if (!value) throw new Error(`${label} is required.`);
      return [name, value];
    }),
  ) as Record<keyof typeof briefFields, string>;
  const amount = text("budget");
  if (!/^\d+(\.\d{1,2})?$/.test(amount))
    throw new Error("Enter a nonnegative budget with at most two decimal places.");
  const [whole, fraction = ""] = amount.split(".");
  const budgetCents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(budgetCents)) throw new Error("The budget is too large.");
  const startsAt = utcDate(text("startsAt"));
  const endsAt = text("endsAt") ? utcDate(text("endsAt")) : undefined;
  if (endsAt !== undefined && endsAt <= startsAt)
    throw new Error("The end must be after the start.");
  if (endsAt !== undefined && endsAt % (30 * 60_000) !== 0)
    throw new Error("Choose an end time at :00 or :30 UTC.");
  return {
    ...brief,
    budgetCents,
    startsAt,
    ...(endsAt === undefined ? {} : { endsAt }),
    status: "draft",
  };
}
