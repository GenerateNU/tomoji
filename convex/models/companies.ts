import type { MutationCtx, QueryCtx } from "../_generated/server";
import {apiError} from "../lib/errors";
import {Doc, Id} from "../_generated/dataModel";
import {PaginationOptions, PaginationResult} from "convex/server";

export async function getCompanyByWorkosId(ctx: MutationCtx | QueryCtx, orgId: string) {
  return await ctx.db
    .query("companies")
    .withIndex("by_workosId", (q) => q.eq("workosId", orgId))
    .unique();
}

/** Returns the company, or throws `not_found` if it does not exist. */
export async function requireCompany(
    ctx: MutationCtx | QueryCtx,
    companyId: Id<"companies">,
): Promise<Doc<"companies">> {
  const company = await ctx.db.get(companyId);
  if (company === null) {
    throw apiError("not_found", { companyId });
  }
  return company;
}

/** Returns one cursor-paginated page of companies. */
export async function listCompanies(
    ctx: QueryCtx,
    paginationOpts: PaginationOptions,
): Promise<PaginationResult<Doc<"companies">>> {
  return await ctx.db.query("companies").paginate(paginationOpts);
}

/** Helper for shared validation */
function normalizeCompanyName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw apiError("invalid_state", { reason: "company_name_blank" });
  }
  return trimmed;
}

/**
 * Creates an active company for a WorkOS organization.
 *
 * @throws `invalid_state` if `name` or `workosId` is blank.
 * @throws `conflict` if a company already exists for `workosId`.
 */
export async function createCompany(
    ctx: MutationCtx,
    company: { workosId: string; name: string },
): Promise<Id<"companies">> {
  const workosId = company.workosId.trim();
  if (workosId.length === 0) {
    throw apiError("invalid_state", { reason: "workos_id_blank" });
  }
  const name = normalizeCompanyName(company.name);

  // `getCompanyByWorkosId` uses `.unique()`, so a second row for the same org
  // would break every later lookup for it.
  if ((await getCompanyByWorkosId(ctx, workosId)) !== null) {
    throw apiError("conflict", { workosId });
  }

  return await ctx.db.insert("companies", { workosId, name, isActive: true });
}

/**
 * Updates only the fields that were provided.
 *
 * @throws `invalid_state` if `name` is provided but blank.
 */
export async function updateCompany(
    ctx: MutationCtx,
    companyId: Id<"companies">,
    fields: { name?: string; profilePicture?: string },
): Promise<void> {
  const patch: Partial<Pick<Doc<"companies">, "name" | "profilePicture">> = {};
  if (fields.name !== undefined) patch.name = normalizeCompanyName(fields.name);
  if (fields.profilePicture !== undefined) patch.profilePicture = fields.profilePicture;
  await ctx.db.patch(companyId, patch);
}