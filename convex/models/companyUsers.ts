import { apiError } from "../lib/errors";
import type { Doc, Id } from "../_generated/dataModel";
import { MutationCtx, QueryCtx } from "../_generated/server";
import { getCompanyByWorkosId } from "./companies";

export async function getCompanyUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  companyId: Id<"companies">,
): Promise<Doc<"companyUsers"> | null> {
  return await ctx.db
    .query("companyUsers")
    .withIndex("by_userId_and_companyId", (q) => q.eq("userId", userId).eq("companyId", companyId))
    .unique();
}

/**
 * Resolves the caller's membership in `orgId`, which is what proves they may
 * act on that company's data. Returns the `companyUsers` row so callers get
 * both the `companyId` and the membership id for attribution.
 */
export async function requireMembership(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  orgId: string,
): Promise<Doc<"companyUsers">> {
  const company = await getCompanyByWorkosId(ctx, orgId);
  if (company === null) {
    throw apiError("not_synced", { orgId });
  }
  const membership = await getCompanyUser(ctx, userId, company._id);
  if (membership === null) {
    throw apiError("forbidden");
  }
  return membership;
}
