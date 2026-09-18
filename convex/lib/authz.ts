import type { UserIdentity } from "convex/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "./errors";

/**
 * Returns the caller's identity, or throws if they are not signed in.
 */
export async function requireIdentity(
  ctx: QueryCtx | MutationCtx | ActionCtx,
): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) {
    throw apiError("not_authenticated");
  }
  return identity;
}
