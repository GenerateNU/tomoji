import type { PaginationOptions, PaginationResult, UserIdentity } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import { env } from "../_generated/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireIdentity } from "../lib/authz";
import { apiError } from "../lib/errors";
import { findOrgId } from "../lib/identity";
import { requireNonBlank } from "../lib/validation";
import type { companyRole } from "../schemas/companyUsers.schema";
import type { Infer } from "convex/values";
import { getCompanyByWorkosId } from "./companies";
import { getCompanyUser, getCompanyUserByUserId } from "./companyUsers";
import { getCreatorByUserId, hasCreatorActivity } from "./creators";

export async function getUserByWorkosId(
  ctx: QueryCtx | MutationCtx,
  workosId: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_workosId", (q) => q.eq("workosId", workosId))
    .unique();
}

/** Returns a paginated user page, excluding inactive accounts unless explicitly included. */
export async function listUsers(
  ctx: QueryCtx,
  options: {
    role?: Doc<"users">["role"];
    includeInactive?: boolean;
    paginationOpts: PaginationOptions;
  },
): Promise<PaginationResult<Doc<"users">>> {
  const role = options.role;
  if (options.includeInactive === true) {
    if (role === undefined) {
      return await ctx.db.query("users").paginate(options.paginationOpts);
    }

    return await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", role))
      .paginate(options.paginationOpts);
  }

  if (role === undefined) {
    return await ctx.db
      .query("users")
      .withIndex("by_isActive", (q) => q.eq("isActive", true))
      .paginate(options.paginationOpts);
  }

  return await ctx.db
    .query("users")
    .withIndex("by_role_and_isActive", (q) => q.eq("role", role).eq("isActive", true))
    .paginate(options.paginationOpts);
}

export type WorkosProfile = {
  workosId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Returns another user who holds `email`, or null. Accounts WorkOS deleted and
 * duplicate-email rows release their email; operator-locked accounts keep it.
 */
export async function getEmailOwner(
  ctx: QueryCtx | MutationCtx,
  email: string,
  excludeUserId?: Id<"users">,
): Promise<Doc<"users"> | null> {
  for await (const user of ctx.db
    .query("users")
    .withIndex("by_email", (q) => q.eq("email", email))) {
    if (user._id === excludeUserId) continue;
    if (user.deactivatedReason === "deleted" || user.deactivatedReason === "duplicate_email") {
      continue;
    }
    return user;
  }
  return null;
}

/**
 * Syncs WorkOS identity fields without replacing a user's S3 profile-picture
 * reference. An email already held by another account never transfers: a new
 * user is inserted locked as `duplicate_email`, and an update keeps the old
 * email. Both log and return so the webhook is acknowledged.
 */
export async function upsertUser(ctx: MutationCtx, profile: WorkosProfile): Promise<Id<"users">> {
  const existing = await getUserByWorkosId(ctx, profile.workosId);
  const email = normalizeEmail(profile.email);
  const firstName = requireNonBlank(
    (profile.firstName === undefined ? existing?.firstName : profile.firstName)?.trim() ||
      profile.email,
    "firstName",
  );
  const lastName =
    profile.lastName === undefined ? (existing?.lastName ?? "") : (profile.lastName ?? "");

  if (existing === null) {
    const owner = await getEmailOwner(ctx, email);
    if (owner !== null) {
      const userId = await ctx.db.insert("users", {
        workosId: profile.workosId,
        firstName,
        lastName,
        email,
        role: "creator",
        isActive: false,
        deactivatedReason: "duplicate_email",
      });
      console.warn("duplicate email on user.created", {
        workosId: profile.workosId,
        userId,
        conflictingUserId: owner._id,
      });
      return userId;
    }

    const userId = await ctx.db.insert("users", {
      workosId: profile.workosId,
      firstName,
      lastName,
      email,
      role: "creator",
      isActive: true,
    });
    await ctx.db.insert("creators", { userId, isPrivate: false });
    return userId;
  }

  if (email !== existing.email) {
    const owner = await getEmailOwner(ctx, email, existing._id);
    if (owner !== null) {
      await ctx.db.patch("users", existing._id, { firstName, lastName });
      console.warn("duplicate email on user.updated", {
        workosId: profile.workosId,
        userId: existing._id,
        conflictingUserId: owner._id,
      });
      return existing._id;
    }
  }

  await ctx.db.patch("users", existing._id, {
    firstName,
    lastName,
    email,
  });
  return existing._id;
}

/**
 * Activates or deactivates an account. Only an operator can call this.
 *
 * Deactivating records `operator` as the reason, upgrading a `left_company` or
 * missing reason so a later rejoin cannot undo it. `deleted` and
 * `duplicate_email` are left as they are. Activating an active account is a
 * no-op; otherwise it clears the reason and creates the creator row a
 * duplicate-email account never got.
 *
 * @throws `not_found` if the user does not exist.
 * @throws `invalid_state` with `no_active_membership` when activating a company
 * user who has no active membership.
 * @throws `invalid_state` with `email_in_use` when activating a duplicate-email
 * account whose email another account still holds.
 */
export async function setUserActive(
  ctx: MutationCtx,
  userId: Id<"users">,
  isActive: boolean,
): Promise<Doc<"users">> {
  const user = await ctx.db.get("users", userId);
  if (user === null) throw apiError("not_found", { resource: "user" });

  if (!isActive) {
    if (user.isActive) {
      await ctx.db.patch("users", userId, {
        isActive: false,
        deactivatedReason: "operator",
      });
      return { ...user, isActive: false, deactivatedReason: "operator" };
    }
    if (user.deactivatedReason === undefined || user.deactivatedReason === "left_company") {
      await ctx.db.patch("users", userId, { deactivatedReason: "operator" });
      return { ...user, deactivatedReason: "operator" };
    }
    return user;
  }

  if (user.isActive) return user;

  if (user.role === "company" && (await getCompanyUserByUserId(ctx, userId)) === null) {
    throw apiError("invalid_state", { reason: "no_active_membership" });
  }
  if (
    user.deactivatedReason === "duplicate_email" &&
    (await getEmailOwner(ctx, user.email, userId)) !== null
  ) {
    throw apiError("invalid_state", { reason: "email_in_use" });
  }

  await ctx.db.patch("users", userId, {
    isActive: true,
    deactivatedReason: undefined,
  });
  if (user.role === "creator" && (await getCreatorByUserId(ctx, userId)) === null) {
    await ctx.db.insert("creators", { userId, isPrivate: false });
  }
  const updated = await ctx.db.get("users", userId);
  if (updated === null) throw apiError("not_found", { resource: "user" });
  return updated;
}

export async function deactivateUser(ctx: MutationCtx, workosId: string): Promise<void> {
  const user = await getUserByWorkosId(ctx, workosId);
  if (user !== null) {
    await ctx.db.patch("users", user._id, {
      isActive: false,
      deactivatedReason: "deleted",
    });
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

/** Whether a WorkOS organization is the Tomoji staff org rather than a customer. */
export function isOperatorOrg(organizationId: string): boolean {
  const operatorOrgId = env.WORKOS_OPERATOR_ORG_ID;
  return operatorOrgId !== undefined && operatorOrgId === organizationId;
}

export async function applyMembership(ctx: MutationCtx, event: MembershipEvent): Promise<void> {
  const user = await getUserByWorkosId(ctx, event.workosUserId);
  if (user === null) {
    throw apiError("not_synced", { workosUserId: event.workosUserId });
  }

  // Tomoji staff get the operator role and no company of their own.
  if (isOperatorOrg(event.organizationId)) {
    await makeOperator(ctx, user);
    return;
  }

  // An operator belongs to no customer company: recording the membership would
  // list Tomoji staff among a customer's own people. Leaving the staff org is
  // the one exit, and it is the reason that says so, not inactivity alone — a
  // locked or deleted operator is inactive too, and letting those through would
  // turn an organization invite into a way to drop the role and the lock with it.
  const leftStaffOrg = !user.isActive && user.deactivatedReason === "left_company";
  if (user.role === "operator" && !leftStaffOrg) {
    console.warn("ignoring company membership for an operator", {
      workosId: event.workosUserId,
      userId: user._id,
      organizationId: event.organizationId,
    });
    return;
  }

  const existingCompany = await getCompanyByWorkosId(ctx, event.organizationId);
  const membership = await getCompanyUserByUserId(ctx, user._id);
  if (membership !== null && membership.companyId !== existingCompany?._id) {
    throw apiError("conflict", { reason: "already_in_company" });
  }

  // Linked X, application, or assignment data must not be converted away:
  // those rows are creator-scoped and would be stranded. A former operator
  // reaches this too, because promotion leaves their creator row in place.
  if (user.role !== "company" && membership === null) {
    const creator = await getCreatorByUserId(ctx, user._id);
    if (creator !== null && (await hasCreatorActivity(ctx, creator._id))) {
      console.warn("refusing to convert creator with activity to company", {
        workosId: event.workosUserId,
        userId: user._id,
        creatorId: creator._id,
        organizationId: event.organizationId,
      });
      return;
    }
  }

  const companyId =
    existingCompany?._id ??
    (await ctx.db.insert("companies", {
      workosId: event.organizationId,
      name: event.organizationName,
      isActive: true,
    }));

  // A prior membership at this same company is reopened rather than duplicated.
  const prior = membership ?? (await getCompanyUser(ctx, user._id, companyId));
  if (prior === null) {
    await ctx.db.insert("companyUsers", {
      userId: user._id,
      companyId,
      role: event.role,
      isActive: true,
    });
  } else {
    await ctx.db.patch("companyUsers", prior._id, {
      role: event.role,
      isActive: true,
    });
  }

  // Whoever reaches here is a member of this company now, so the account role
  // follows. A former operator must not keep `operator` through the
  // reactivation below, which would hand back every company.
  if (user.role !== "company") {
    await ctx.db.patch("users", user._id, { role: "company" });
  }
  // Joining a company undoes only the deactivation that leaving one applied.
  if (!user.isActive && user.deactivatedReason === "left_company") {
    await ctx.db.patch("users", user._id, {
      isActive: true,
      deactivatedReason: undefined,
    });
  }
}

/**
 * Promotes a user to operator. They keep any creator row they already had; it
 * is simply unreachable while their role is `operator`.
 */
async function makeOperator(ctx: MutationCtx, user: Doc<"users">): Promise<void> {
  const patch: Partial<Doc<"users">> = {};
  if (user.role !== "operator") patch.role = "operator";
  if (!user.isActive && user.deactivatedReason === "left_company") {
    patch.isActive = true;
    patch.deactivatedReason = undefined;
  }
  if (Object.keys(patch).length > 0) await ctx.db.patch("users", user._id, patch);
}

/**
 * Deactivates a user WorkOS removed from their company. The membership row
 * stays: `campaigns.createdBy`, `opportunities.createdBy`,
 * `submissions.reviewedBy`, and `assignments.productAccessDeliveredBy` all
 * point at it, so deleting it would orphan that history.
 *
 * `requireUser` already refuses an inactive account, so this is the whole
 * lockout. Reactivating is an operator action.
 */
export async function removeMembership(
  ctx: MutationCtx,
  event: { workosUserId: string; organizationId: string },
): Promise<void> {
  const user = await getUserByWorkosId(ctx, event.workosUserId);
  // Leaving the staff org revokes operator access the same way leaving a
  // company revokes company access. The role stays, so an operator can restore
  // them; joining a customer company instead converts them there.
  if (isOperatorOrg(event.organizationId)) {
    if (user !== null && user.isActive) {
      await ctx.db.patch("users", user._id, {
        isActive: false,
        deactivatedReason: "left_company",
      });
    }
    return;
  }
  const company = await getCompanyByWorkosId(ctx, event.organizationId);
  if (user === null || company === null) return;

  const membership = await getCompanyUser(ctx, user._id, company._id);
  if (membership === null || !membership.isActive) return;

  await ctx.db.patch("companyUsers", membership._id, { isActive: false });
  if (user.isActive) {
    await ctx.db.patch("users", user._id, {
      isActive: false,
      deactivatedReason: "left_company",
    });
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
): Promise<{
  identity: UserIdentity;
  user: Doc<"users">;
  orgId: string | null;
}> {
  const { identity, user } = await requireUser(ctx);

  if (user.role !== role) {
    throw apiError("forbidden", { requiredRole: role });
  }
  return { identity, user, orgId: findOrgId(identity) };
}

/** Returns the caller's creator ID, or throws if their creator row is missing. */
export async function requireCallerCreatorId(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
): Promise<Id<"creators">> {
  const creator = await getCreatorByUserId(ctx, user._id);
  if (creator === null) {
    throw apiError("not_found", { resource: "creator" });
  }
  return creator._id;
}
