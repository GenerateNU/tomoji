import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";

export type DirectoryUser = FunctionReturnType<typeof api.users.list>["page"][number];
export type DirectoryCompany = FunctionReturnType<typeof api.companies.list>["page"][number];

const ROLE_LABELS = {
  creator: "Creator",
  company: "Company user",
  operator: "Operator",
} as const;

export type DirectoryRole = keyof typeof ROLE_LABELS;

export function roleLabel(role: DirectoryRole): string {
  return ROLE_LABELS[role];
}

/** The account's full name, falling back to the email before anyone has synced one. */
export function userName(user: Pick<DirectoryUser, "firstName" | "lastName" | "email">): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return name || user.email;
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function formatDate(timestamp: number): string {
  return dateFormat.format(timestamp);
}

/** "1,204" or "1,000+" once a count hit its scan cap. */
export function formatCount({ value, capped }: { value: number; capped: boolean }): string {
  return `${value.toLocaleString("en-US")}${capped ? "+" : ""}`;
}
