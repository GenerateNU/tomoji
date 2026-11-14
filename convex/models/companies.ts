import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireUrl } from "../lib/urls";
import { requireCountry } from "./countries";
import { requireNonBlank } from "../lib/validation";
import { Doc, Id } from "../_generated/dataModel";
import { PaginationOptions, PaginationResult } from "convex/server";

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
  const company = await ctx.db.get("companies", companyId);
  if (company === null) {
    throw apiError("not_found", { companyId });
  }
  return company;
}

/**
 * Returns one cursor-paginated page of companies, optionally restricted to
 * active or inactive ones.
 */
export async function listCompanies(
  ctx: QueryCtx,
  options: { isActive?: boolean; paginationOpts: PaginationOptions },
): Promise<PaginationResult<Doc<"companies">>> {
  const isActive = options.isActive;
  if (isActive === undefined) {
    return await ctx.db.query("companies").paginate(options.paginationOpts);
  }

  return await ctx.db
    .query("companies")
    .withIndex("by_isActive", (q) => q.eq("isActive", isActive))
    .paginate(options.paginationOpts);
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
  const workosId = requireNonBlank(company.workosId, "workos_id");
  const name = requireNonBlank(company.name, "company_name");

  // `getCompanyByWorkosId` uses `.unique()`, so a second row for the same org
  // would break every later lookup for it.
  if ((await getCompanyByWorkosId(ctx, workosId)) !== null) {
    throw apiError("conflict", { workosId });
  }

  return await ctx.db.insert("companies", { workosId, name, isActive: true });
}

/** Longest industry we store, so a stray paste cannot fill the field. */
export const MAX_INDUSTRY_LENGTH = 80;

export type CompanyUpdate = {
  name?: string;
  website?: string | null;
  description?: string | null;
  countryOfResidence?: string | null;
  industry?: string | null;
};

/**
 * Updates only the fields that were provided. The picture and banner are not
 * here: they are set by completing their upload, so the stored id always
 * points at finished media.
 *
 * @throws `invalid_state` if a provided field is blank or malformed.
 */
export async function updateCompany(
  ctx: MutationCtx,
  companyId: Id<"companies">,
  fields: CompanyUpdate,
): Promise<void> {
  const patch: Partial<
    Pick<Doc<"companies">, "name" | "website" | "description" | "countryOfResidence" | "industry">
  > = {};
  if (fields.name !== undefined) patch.name = requireNonBlank(fields.name, "company_name");
  // Clients use null to clear an optional field, as in creator updates.
  if (fields.website !== undefined) {
    patch.website =
      fields.website === null
        ? undefined
        : requireUrl(requireNonBlank(fields.website, "website"), { reason: "invalid_website" });
  }
  if (fields.description !== undefined) {
    patch.description =
      fields.description === null ? undefined : requireNonBlank(fields.description, "description");
  }
  if (fields.countryOfResidence !== undefined) {
    patch.countryOfResidence =
      fields.countryOfResidence === null ? undefined : requireCountry(fields.countryOfResidence);
  }
  if (fields.industry !== undefined) {
    patch.industry =
      fields.industry === null
        ? undefined
        : requireNonBlank(fields.industry, "industry", MAX_INDUSTRY_LENGTH);
  }
  await ctx.db.patch("companies", companyId, patch);
}
