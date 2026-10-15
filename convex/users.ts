import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireIdentity } from "./lib/authz";
import { apiError } from "./lib/errors";
import { operatorMutation, operatorQuery } from "./lib/functions";
import { findOrgId } from "./lib/identity";
import { requireMembership } from "./models/companyUsers";
import { getUserByWorkosId, listUsers, setUserActive } from "./models/users";
import schema from "./schema";
import { companyRole } from "./schemas/companyUsers.schema";
import { userRole } from "./schemas/users.schema";

const identityFields = {
  synced: v.literal(true),
  userId: v.id("users"),
  firstName: v.optional(v.string()),
  lastName: v.optional(v.string()),
  email: v.string(),
  profilePictureMediaId: v.optional(v.id("mediaUploads")),
};

const meResult = v.union(
  v.object({ synced: v.literal(false) }),
  v.object({ ...identityFields, role: v.literal("creator") }),
  v.object({ ...identityFields, role: v.literal("operator") }),
  v.object({
    ...identityFields,
    role: v.literal("company"),
    orgId: v.string(),
    companyRole,
  }),
);

export const me = query({
  args: {},
  returns: meResult,
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    const user = await getUserByWorkosId(ctx, identity.subject);

    // `synced: false` is the window before the WorkOS webhook has landed.
    if (user === null) return { synced: false as const };

    const base = {
      synced: true as const,
      userId: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      profilePictureMediaId: user.profilePictureMediaId,
    };

    if (user.role !== "company") return { ...base, role: user.role };

    const orgId = findOrgId(identity);
    if (orgId === null) {
      throw apiError("misconfigured", { reason: "company account has no organization" });
    }

    // The membership row is authoritative. The token's role claim can be stale
    // until it refreshes, and `companyContext` already reads it from here.
    const membership = await requireMembership(ctx, user._id, orgId);
    return { ...base, role: "company" as const, orgId, companyRole: membership.role };
  },
});

/** Lists active users for operators, with optional role and inactive-account inclusion. */
export const list = operatorQuery({
  args: {
    role: v.optional(userRole),
    includeInactive: v.optional(v.boolean()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(schema.doc("users")),
  handler: async (ctx, args) => {
    return await listUsers(ctx, args);
  },
});

/**
 * Activates or deactivates an account. Deactivation is our soft delete: the
 * row and everything referencing it stay, but `requireUser` refuses the caller.
 * WorkOS removing someone from their company deactivates them automatically.
 *
 * @throws `not_found` if the user does not exist.
 */
export const setActive = operatorMutation({
  args: { userId: v.id("users"), isActive: v.boolean() },
  returns: schema.doc("users"),
  handler: async (ctx, args) => {
    return await setUserActive(ctx, args.userId, args.isActive);
  },
});
