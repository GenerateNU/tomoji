import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { companyAdminContext, creatorContext, operatorContext } from "./lib/functions";
import { requireCallerCreatorId } from "./models/users";
import schema from "./schema";

/**
 * Role checks for actions, which have no database access of their own. Each
 * one resolves the caller exactly as the matching query or mutation builder
 * would.
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

/**
 * Resolves the caller's own creator profile, so actions act on it without
 * taking a creator id an attacker could swap.
 *
 * @throws `forbidden` unless the caller is a creator.
 */
export const creator = internalQuery({
  args: {},
  returns: v.object({ user: schema.doc("users"), creatorId: v.id("creators") }),
  handler: async (ctx) => {
    const { user } = await creatorContext(ctx);
    return { user, creatorId: await requireCallerCreatorId(ctx, user) };
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
