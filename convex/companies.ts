import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { companyMutation, operatorMutation, operatorQuery } from "./lib/functions";
import { createCompany, listCompanies, requireCompany, updateCompany } from "./models/companies";
import schema from "./schema";

/** A company as returned to operators. `workosId` is internal and left out. */
const companyView = schema.doc("companies").omit("workosId");

/**
 * Picks fields explicitly so `workosId`, or any field added later, is only
 * exposed on purpose. The returns validator rejects extra fields.
 */
function toCompanyView(company: Doc<"companies">): Infer<typeof companyView> {
  const { _id, _creationTime, name, isActive, profilePicture } = company;
  return { _id, _creationTime, name, isActive, profilePicture };
}

/**
 * Gets a company by id. Operator-only for now: companies must never see other
 * companies, and what creators may see is still undecided.
 *
 * @throws `not_found` if `companyId` does not exist.
 */
export const get = operatorQuery({
  args: { companyId: v.id("companies") },
  returns: companyView,
  handler: async (ctx, args) => {
    return toCompanyView(await requireCompany(ctx, args.companyId));
  },
});

/**
 * Updates the caller's company. Open to any member for now; restricting it
 * to company admins is tracked in a follow-up ticket.
 *
 * @throws `invalid_state` if `name` or `profilePicture` is blank.
 */
export const update = companyMutation({
  args: {
    name: v.optional(v.string()),
    profilePicture: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
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

/**
 * Lists companies for operators with cursor pagination. Includes inactive
 * companies unless `isActive` is given.
 */
export const list = operatorQuery({
  args: {
    isActive: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(companyView),
  handler: async (ctx, args) => {
    const result = await listCompanies(ctx, args);
    return { ...result, page: result.page.map(toCompanyView) };
  },
});
