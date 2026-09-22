import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import {
  authedQuery,
  companyContext,
  companyMutation,
  operatorMutation,
  operatorQuery,
} from "./lib/functions";
import { createCompany, listCompanies, requireCompany, updateCompany } from "./models/companies";
import schema from "./schema";

/**
 * Gets a company by id, or the caller's company (found via caller's current token - users can belong to more than one company)
 * when `companyId` is omitted.
 *
 * @throws `not_found` if `companyId` does not exist.
 * @throws `forbidden` if `companyId` is omitted and the caller is not a
 * company user.
 */
export const get = authedQuery({
  args: { companyId: v.optional(v.id("companies")) },
  returns: schema.doc("companies"),
  handler: async (ctx, args) => {
    if (args.companyId !== undefined) {
      return await requireCompany(ctx, args.companyId);
    }
    const { membership } = await companyContext(ctx);
    return await requireCompany(ctx, membership.companyId);
  },
});

/**
 * Updates the caller's company.
 *
 * @throws `invalid_state` if `name` is blank.
 */
export const update = companyMutation({
  args: {
    name: v.optional(v.string()),
    profilePicture: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    //TODO: Optional: restrict to company admins.
    // if (ctx.membership.role !== "admin") throw apiError("forbidden", { requiredCompanyRole: "admin" });
    await updateCompany(ctx, ctx.membership.companyId, args);
    return null;
  },
});

/**
 * Creates a company for a WorkOS organization. Operator-only.
 *
 * @throws `conflict` if a company already exists for `workosId`.
 * @throws `invalid_state` if `name` or `workosId` is blank.
 */
export const create = operatorMutation({
  args: { workosId: v.string(), name: v.string() },
  returns: v.id("companies"),
  handler: async (ctx, args) => {
    return await createCompany(ctx, args);
  },
});

/** Lists all companies for operators with cursor pagination. */
export const list = operatorQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(schema.doc("companies")),
  handler: async (ctx, args) => {
    return await listCompanies(ctx, args.paginationOpts);
  },
});
