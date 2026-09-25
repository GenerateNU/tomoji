import type { PaginationOptions, PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { displayName } from "../lib/identity";
import { companyRole } from "../schemas/companyUsers.schema";
import { getCompanyByWorkosId } from "./companies";

/** Finds the user's sole company membership; membership writes enforce this invariant. */
export async function getCompanyUserByUserId(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"companyUsers"> | null> {
  return await ctx.db
    .query("companyUsers")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

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
 * A company member as returned to the client.
 * Deliberately narrower than the `users` document, which also holds `workosId`, `isActive`,
 * and the account-level `role`.
 */
export const companyMember = v.object({
  membershipId: v.id("companyUsers"),
  userId: v.id("users"),
  role: companyRole,
  name: v.string(),
  email: v.string(),
  profilePicture: v.optional(v.string()),
});

export type CompanyMember = Infer<typeof companyMember>;

/**
 * Returns one page of a company's active members, joined with their user
 * profile.
 * Members whose user is deactivated are left out, as are memberships
 * whose user row is missing.
 */
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
      const user = await ctx.db.get("users", membership.userId);
      if (user === null) {
        console.error("dangling companyUsers row", {
          membershipId: membership._id,
          userId: membership.userId,
        });
        return null;
      }
      // A deactivated account is treated as deleted.
      if (!user.isActive) return null;
      return {
        membershipId: membership._id,
        userId: user._id,
        role: membership.role,
        name: displayName(user),
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
