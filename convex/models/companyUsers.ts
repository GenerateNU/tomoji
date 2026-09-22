import type { PaginationOptions, PaginationResult } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
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

export type CompanyMember = {
  membershipId: Id<"companyUsers">;
  userId: Id<"users">;
  role: Doc<"companyUsers">["role"];
  name: string;
  email: string;
  profilePicture?: string;
};

/** Returns one page of a company's members, joined with their user profile. */
export async function listCompanyUsers(
  ctx: QueryCtx,
  companyId: Id<"companies">,
  paginationOpts: PaginationOptions,
): Promise<PaginationResult<CompanyMember>> {
  const result = await ctx.db
    .query("companyUsers")
    .withIndex("by_companyId", (q) => q.eq("companyId", companyId))
    .paginate(paginationOpts);

  const members = await Promise.all(
    result.page.map(async (membership): Promise<CompanyMember | null> => {
      const user = await ctx.db.get(membership.userId);
      // Users are never deleted, only deactivated, so a missing user means a
      // dangling membership row. Drop it rather than failing the whole page.
      if (user === null) {
        console.error("dangling companyUsers row", {
          membershipId: membership._id,
          userId: membership.userId,
        });
        return null;
      }
      return {
        membershipId: membership._id,
        userId: user._id,
        role: membership.role,
        name: user.name,
        email: user.email,
        profilePicture: user.profilePicture,
      };
    }),
  );

  return {
    ...result,
    page: members.filter((member): member is CompanyMember => member !== null),
  };
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
