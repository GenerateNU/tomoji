import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { companyQuery } from "./lib/functions";
import { listCompanyUsers } from "./models/companyUsers";
import { companyMember } from "./schemas/companyUsers.schema";

/** Lists the members of the caller's company with cursor pagination. */
export const list = companyQuery({
    args: { paginationOpts: paginationOptsValidator },
    returns: paginationResultValidator(companyMember),
    handler: async (ctx, args) => {
        return await listCompanyUsers(ctx, {
            companyId: ctx.membership.companyId,
            paginationOpts: args.paginationOpts,
        });
    },
});
