import type { MutationCtx, QueryCtx } from "../_generated/server";

export async function companyByWorkosId(ctx: MutationCtx | QueryCtx, orgId: string) {
  return await ctx.db
    .query("companies")
    .withIndex("by_workosId", (q) => q.eq("workosId", orgId))
    .unique();
}
