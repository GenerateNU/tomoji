import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { companyQuery } from "./lib/functions";
import { listCompanyUsers } from "./models/companyUsers";
import { companyRole } from "./schemas/companyUsers.schema";

/**
 * A company member as returned to the client: the membership joined with the
 * fields of its user that are safe to share inside a company. Deliberately
 * narrower than the `users` document, which also holds `workosId`, `isActive`,
 * and the account-level `role`.
 */
const companyMember = v.object({
  membershipId: v.id("companyUsers"),
  userId: v.id("users"),
  role: companyRole,
  name: v.string(),
  email: v.string(),
  profilePicture: v.optional(v.string()),
});

/** Lists the members of the caller's company with cursor pagination. */
export const list = companyQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(companyMember),
  handler: async (ctx, args) => {
    return await listCompanyUsers(ctx, ctx.membership.companyId, args.paginationOpts);
  },
});
