import type { CompanyMember } from "@convex/models/companyUsers";

/** Uses available name parts, falling back to the member's email. */
export function memberName(
  member: Pick<CompanyMember, "firstName" | "lastName" | "email">,
): string {
  return (
    [member.firstName.trim(), member.lastName.trim()].filter(Boolean).join(" ") || member.email
  );
}
