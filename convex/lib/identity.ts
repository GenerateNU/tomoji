import type { UserIdentity } from "convex/server";
import type { Infer } from "convex/values";
import { apiError } from "./errors";
import type { companyRole } from "../schemas/companyUsers.schema";

export function findOrgId(identity: UserIdentity): string | null {
  const orgId = identity.org_id;
  return typeof orgId === "string" && orgId.length > 0 ? orgId : null;
}

/**
 * Maps a WorkOS role slug to our company role. The configured slugs are exactly
 * `admin` and `member`; anything else means someone added a role in WorkOS that
 * this app does not understand, so fail rather than silently demote them.
 *
 * @throws `misconfigured` with reason `unknown_company_role`.
 */
export function toCompanyRole(slug: unknown): Infer<typeof companyRole> {
  if (slug === "admin" || slug === "member") return slug;
  throw apiError("misconfigured", { reason: "unknown_company_role" });
}
