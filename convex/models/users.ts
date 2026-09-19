import type { PaginationOptions, PaginationResult, UserIdentity } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireIdentity } from "../lib/authz";
import { apiError } from "../lib/errors";
import { findOrgId } from "../lib/identity";
import type { companyRole } from "../schemas/companyUsers.schema";
import type { Infer } from "convex/values";
import { getCompanyByWorkosId } from "./companies";
import { getCompanyUser } from "./companyUsers";

export async function getUserByWorkosId(
  ctx: QueryCtx | MutationCtx,
  workosId: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_workosId", (q) => q.eq("workosId", workosId))
    .unique();
}

export async function listUsers(
  ctx: QueryCtx,
  options: { role?: Doc<"users">["role"]; paginationOpts: PaginationOptions },
): Promise<PaginationResult<Doc<"users">>> {
  const role = options.role;
  if (role === undefined) {
    return await ctx.db.query("users").paginate(options.paginationOpts);
  }

  return await ctx.db
    .query("users")
    .withIndex("by_role", (q) => q.eq("role", role))
    .paginate(options.paginationOpts);
}

export type WorkosProfile = {
  workosId: string;
  email: string;
  name?: string;
  profilePicture?: string;
};

export async function upsertUser(ctx: MutationCtx, profile: WorkosProfile): Promise<Id<"users">> {
  const existing = await getUserByWorkosId(ctx, profile.workosId);
  const name = profile.name ?? existing?.name ?? profile.email;
  const profilePicture = profile.profilePicture ?? existing?.profilePicture;

  if (existing === null) {
    const userId = await ctx.db.insert("users", {
      workosId: profile.workosId,
      name,
      email: profile.email,
      role: "creator",
      isActive: true,
      profilePicture,
    });
    await ctx.db.insert("creators", { userId });
    return userId;
  }

  await ctx.db.patch(existing._id, { name, email: profile.email, profilePicture });
  return existing._id;
}

export async function deactivateUser(ctx: MutationCtx, workosId: string): Promise<void> {
  const user = await getUserByWorkosId(ctx, workosId);
  if (user !== null) {
    await ctx.db.patch(user._id, { isActive: false });
  }
}

export type MembershipEvent = {
  workosUserId: string;
  organizationId: string;
  organizationName: string;
  role: Infer<typeof companyRole>;
};

/**
 * Routes a membership event by status. WorkOS deactivates a membership by
 * flipping it to `inactive` rather than deleting it, so no `deleted` event
 * fires — without this, deprovisioned users keep company access.
 */
export async function syncMembership(
  ctx: MutationCtx,
  event: MembershipEvent & { status: string },
): Promise<void> {
  if (event.status !== "active") {
    await removeMembership(ctx, {
      workosUserId: event.workosUserId,
      organizationId: event.organizationId,
    });
    return;
  }
  await applyMembership(ctx, event);
}

export async function applyMembership(ctx: MutationCtx, event: MembershipEvent): Promise<void> {
  const user = await getUserByWorkosId(ctx, event.workosUserId);
  if (user === null) {
    throw apiError("not_synced", { workosUserId: event.workosUserId });
  }

  const existingCompany = await getCompanyByWorkosId(ctx, event.organizationId);
  const companyId =
    existingCompany?._id ??
    (await ctx.db.insert("companies", {
      workosId: event.organizationId,
      name: event.organizationName,
      isActive: true,
    }));

  const membership = await getCompanyUser(ctx, user._id, companyId);

  if (membership === null) {
    await ctx.db.insert("companyUsers", { userId: user._id, companyId, role: event.role });
  } else if (membership.role !== event.role) {
    await ctx.db.patch(membership._id, { role: event.role });
  }

  if (user.role === "creator") {
    await ctx.db.patch(user._id, { role: "company" });
  }
}

export async function removeMembership(
  ctx: MutationCtx,
  event: { workosUserId: string; organizationId: string },
): Promise<void> {
  const user = await getUserByWorkosId(ctx, event.workosUserId);
  const company = await getCompanyByWorkosId(ctx, event.organizationId);
  if (user === null || company === null) return;

  const membership = await getCompanyUser(ctx, user._id, company._id);
  if (membership !== null) {
    await ctx.db.delete(membership._id);
  }

  const remaining = await ctx.db
    .query("companyUsers")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .first();

  if (remaining === null && user.role === "company") {
    await ctx.db.patch(user._id, { role: "creator" });
    const profile = await ctx.db
      .query("creators")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
    if (profile === null) {
      await ctx.db.insert("creators", { userId: user._id });
    }
  }
}

export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<{ identity: UserIdentity; user: Doc<"users"> }> {
  const identity = await requireIdentity(ctx);
  const user = await getUserByWorkosId(ctx, identity.subject);

  if (user === null) {
    throw apiError("not_synced");
  }
  if (!user.isActive) {
    throw apiError("account_deactivated");
  }
  return { identity, user };
}

export async function requireRole(
  ctx: QueryCtx | MutationCtx,
  role: Doc<"users">["role"],
): Promise<{ identity: UserIdentity; user: Doc<"users">; orgId: string | null }> {
  const { identity, user } = await requireUser(ctx);

  if (user.role !== role) {
    throw apiError("forbidden", { requiredRole: role });
  }
  return { identity, user, orgId: findOrgId(identity) };
}
