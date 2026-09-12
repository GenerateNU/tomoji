import type { UserIdentity } from "convex/server";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Returns the caller's identity, or throws if they are not signed in.
 *
 * Every public query/mutation that touches user data should start with this
 * rather than accepting a user id as an argument — an id from the client is a
 * claim, not proof.
 */
export async function requireIdentity(ctx: QueryCtx | MutationCtx): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw new Error("Not authenticated");
  }
  return identity;
}

/**
 * The WorkOS organization the caller is acting in, or `null` if their token
 * carries no `org_id` (i.e. they are not acting within an organization).
 *
 * Org scoping is not enforced anywhere yet — roles and permissions are still
 * being designed. When that lands, the scoping belongs here, so that a query
 * which forgets to scope cannot compile.
 */
export function orgIdFrom(identity: UserIdentity): string | null {
  const orgId = (identity as UserIdentity & { org_id?: unknown }).org_id;
  return typeof orgId === "string" ? orgId : null;
}
