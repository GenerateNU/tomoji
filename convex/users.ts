import { v } from "convex/values";
import { query } from "./_generated/server";
import { orgIdFrom, requireIdentity } from "./lib/authz";

/**
 * Smoke test for the WorkOS -> Convex auth bridge.
 *
 * Returns null when nobody is signed in. Once signed in it returns the
 * identity Convex derived from the WorkOS access token — if this returns a
 * real subject, `convex/auth.config.ts` and `ConvexProviderWithAuth` are
 * wired correctly.
 */
export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      subject: v.string(),
      tokenIdentifier: v.string(),
      issuer: v.string(),
      email: v.union(v.string(), v.null()),
      orgId: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (identity === null) {
      return null;
    }
    return {
      subject: identity.subject,
      tokenIdentifier: identity.tokenIdentifier,
      issuer: identity.issuer,
      email: identity.email ?? null,
      orgId: orgIdFrom(identity),
    };
  },
});

/**
 * Same data, but throws for signed-out callers. Exists to exercise
 * `requireIdentity` — the shape every real query will use.
 */
export const requireMe = query({
  args: {},
  returns: v.object({ subject: v.string() }),
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);
    return { subject: identity.subject };
  },
});
