import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { companyAdminContext, operatorContext } from "./lib/functions";
import schema from "./schema";

/**
 * Role checks for actions, which have no database access of their own. Each
 * one resolves the caller exactly as the matching query or mutation builder
 * would, so an action cannot be looser than its equivalent route.
 */

/** @throws `forbidden` unless the caller is a Tomoji operator. */
export const operator = internalQuery({
  args: {},
  returns: schema.doc("users"),
  handler: async (ctx) => {
    const { user } = await operatorContext(ctx);
    return user;
  },
});

/** @throws `forbidden` unless the caller administers their company. */
export const companyAdmin = internalQuery({
  args: {},
  returns: v.object({
    user: schema.doc("users"),
    membership: schema.doc("companyUsers"),
    orgId: v.string(),
  }),
  handler: async (ctx) => {
    const { user, membership, orgId } = await companyAdminContext(ctx);
    return { user, membership, orgId };
  },
});
