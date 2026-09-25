import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireIdentity } from "./lib/authz";
import { apiError } from "./lib/errors";
import { operatorQuery } from "./lib/functions";
import { displayName, findOrgId, toCompanyRole } from "./lib/identity";
import { getUserByWorkosId, listUsers } from "./models/users";
import schema from "./schema";
import { companyRole } from "./schemas/companyUsers.schema";
import { userRole } from "./schemas/users.schema";

const identityFields = {
  synced: v.literal(true),
  userId: v.id("users"),
  name: v.string(),
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
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
      name: displayName(user),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    };

    if (user.role !== "company") return { ...base, role: user.role };

    const orgId = findOrgId(identity);
    if (orgId === null) {
      throw apiError("misconfigured", { reason: "company account has no organization" });
    }

    return { ...base, role: "company" as const, orgId, companyRole: toCompanyRole(identity.role) };
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
