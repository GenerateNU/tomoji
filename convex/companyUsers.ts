import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { companyQuery } from "./lib/functions";
import { companyMember, listCompanyUsers } from "./models/companyUsers";

/** Lists the active members of the caller's company with cursor pagination. */
export const list = companyQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(companyMember),
  handler: async (ctx, args) => {
    return await listCompanyUsers(ctx, ctx.membership.companyId, args.paginationOpts);
  },
});
