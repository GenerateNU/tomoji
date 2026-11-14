import type { UserIdentity } from "convex/server";
import type { ActionCtx, MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "./errors";
import type { Id } from "../_generated/dataModel";

/** Server-resolved scope for resources owned by both a creator and a company. */
export type ResourceViewer =
  | { role: "operator" }
  | { role: "creator"; creatorId: Id<"creators"> }
  | { role: "company"; companyId: Id<"companies"> };

/** Checks shared ownership only; callers retain resource-specific visibility rules. */
export function canViewResource(
  viewer: ResourceViewer,
  resource: { creatorId: Id<"creators">; companyId: Id<"companies"> },
): boolean {
  switch (viewer.role) {
    case "operator":
      return true;
    case "creator":
      return resource.creatorId === viewer.creatorId;
    case "company":
      return resource.companyId === viewer.companyId;
  }
}

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
