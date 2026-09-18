import type { UserIdentity } from "convex/server";
import type { Infer } from "convex/values";
import type { companyRole } from "../schemas/companyUsers.schema";

export function findOrgId(identity: UserIdentity): string | null {
  const orgId = identity.org_id;
  return typeof orgId === "string" && orgId.length > 0 ? orgId : null;
}

export function toCompanyRole(slug: unknown): Infer<typeof companyRole> {
  return slug === "admin" ? "admin" : "member";
}
