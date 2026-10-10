import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, env } from "./_generated/server";
import { requireIdentity } from "./lib/authz";
import { apiError } from "./lib/errors";
import {
  createXAuthorization,
  exchangeXCode,
  getXIdentity,
  hashXState,
  readXConfig,
  revokeXToken,
} from "./lib/xOAuth";
import { creatorQuery } from "./lib/functions";
import { getOwnXAccount, xAccount } from "./models/xAccounts";
import type { XAccount } from "./models/xAccounts";
import type { Infer } from "convex/values";
import { xLinkClaim, xRevocationTokens, xLinkAttemptTtlMs } from "./models/xLinkAttempts";

/** Returns the current creator's linked X metadata, never their OAuth credentials. */
export const me = creatorQuery({
  args: {},
  returns: v.union(xAccount, v.null()),
  handler: async (ctx) => await getOwnXAccount(ctx, ctx.user),
});

/** Starts linking for an active creator without making X a Tomoji sign-in provider. */
export const start = action({
  args: {},
  returns: v.object({ authorizationUrl: v.string(), expiresAt: v.number() }),
  handler: async (ctx): Promise<{ authorizationUrl: string; expiresAt: number }> => {
    await requireIdentity(ctx);
    await ctx.runQuery(internal.xAccountsInternal.authorize, {});
    const config = readXConfig(env);
    const authorization = await createXAuthorization(config);
    // Conservative browser expiry; the mutation independently enforces its TTL.
    const expiresAt = Date.now() + xLinkAttemptTtlMs;
    await ctx.runMutation(internal.xAccountsInternal.begin, {
      stateHash: authorization.stateHash,
      verifier: authorization.verifier,
      redirectUri: config.redirectUri,
    });
    return { authorizationUrl: authorization.url, expiresAt };
  },
});

/** Completes a single-use callback with the same authenticated creator. */
export const complete = action({
  args: { state: v.string(), code: v.optional(v.string()), denied: v.optional(v.boolean()) },
  returns: xAccount,
  handler: async (ctx, args): Promise<XAccount> => {
    await requireIdentity(ctx);
    await ctx.runQuery(internal.xAccountsInternal.authorize, {});
    if (
      !args.state ||
      args.state.length > 500 ||
      (!args.denied && (!args.code || args.code.length > 2048))
    )
      throw apiError("invalid_state", { reason: "x_link_invalid" });
    const config = readXConfig(env);
    const claim: Infer<typeof xLinkClaim> = await ctx.runMutation(
      internal.xAccountsInternal.claim,
      { stateHash: await hashXState(args.state) },
    );
    try {
      if (args.denied) throw apiError("invalid_state", { reason: "x_link_denied" });
      if (claim.redirectUri !== config.redirectUri)
        throw apiError("invalid_state", { reason: "x_link_config_changed" });
      const tokens = await exchangeXCode(config, args.code!, claim.verifier);
      const identity = await getXIdentity(tokens.accessToken);
      return await ctx.runMutation(internal.xAccountsInternal.finish, {
        attemptId: claim.attemptId,
        link: { ...tokens, ...identity },
      });
    } catch (error) {
      // Consumed codes are never retried. A failed reconnect preserves the old account.
      try {
        await ctx.runMutation(internal.xAccountsInternal.fail, { attemptId: claim.attemptId });
      } catch {
        /* Account deactivation must not mask the original error. */
      }
      throw error;
    }
  },
});

/** Disconnects locally even when X is unavailable, reporting revocation separately. */
export const remove = action({
  args: {},
  returns: v.object({
    revocation: v.union(v.literal("complete"), v.literal("failed"), v.literal("not_needed")),
  }),
  handler: async (ctx): Promise<{ revocation: "complete" | "failed" | "not_needed" }> => {
    await requireIdentity(ctx);
    const tokens: Infer<typeof xRevocationTokens> = await ctx.runMutation(
      internal.xAccountsInternal.remove,
      {},
    );
    if (tokens === null) return { revocation: "not_needed" };
    try {
      const config = readXConfig(env);
      const results = await Promise.allSettled([
        revokeXToken(config, tokens.refreshToken),
        revokeXToken(config, tokens.accessToken),
      ]);
      return {
        revocation: results.every((result) => result.status === "fulfilled")
          ? "complete"
          : "failed",
      };
    } catch {
      return { revocation: "failed" };
    }
  },
});
