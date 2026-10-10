import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import { creatorContext } from "./lib/functions";
import { xAccount, xAccountLink } from "./models/xAccounts";
import {
  beginXLink,
  claimXLink,
  expireXLink,
  failXLink,
  finishXLink,
  removeOwnXAccount,
  xLinkAttemptTtlMs,
  xLinkClaim,
  xLinkStart,
  xRevocationTokens,
} from "./models/xLinkAttempts";

/** Authorizes the action before it handles PKCE material or makes external calls. */
export const authorize = internalQuery({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await creatorContext(ctx);
    return null;
  },
});

/** Creates an owned attempt and schedules deletion of its short-lived secrets. */
export const begin = internalMutation({
  args: xLinkStart.fields,
  returns: v.id("xLinkAttempts"),
  handler: async (ctx, args) => {
    const { user } = await creatorContext(ctx);
    const attemptId = await beginXLink(ctx, user, args);
    await ctx.scheduler.runAfter(xLinkAttemptTtlMs, internal.xAccountsInternal.expire, {
      attemptId,
    });
    return attemptId;
  },
});

/** Atomically claims an authenticated creator's callback state. */
export const claim = internalMutation({
  args: { stateHash: v.string() },
  returns: xLinkClaim,
  handler: async (ctx, args) => {
    const { user } = await creatorContext(ctx);
    return await claimXLink(ctx, user, args.stateHash);
  },
});

/** Commits the provider-verified identity and credentials after ownership revalidation. */
export const finish = internalMutation({
  args: { attemptId: v.id("xLinkAttempts"), link: xAccountLink },
  returns: xAccount,
  handler: async (ctx, args) => {
    const { user } = await creatorContext(ctx);
    return await finishXLink(ctx, user, args.attemptId, args.link);
  },
});

/** Clears failed attempt state while preserving any prior connection. */
export const fail = internalMutation({
  args: { attemptId: v.id("xLinkAttempts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { user } = await creatorContext(ctx);
    await failXLink(ctx, user, args.attemptId);
    return null;
  },
});

/** Deletes one expired attempt without scanning the table. */
export const expire = internalMutation({
  args: { attemptId: v.id("xLinkAttempts") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await expireXLink(ctx, args.attemptId);
    return null;
  },
});

/** Disconnects locally before best-effort upstream revocation. Never expose this payload. */
export const remove = internalMutation({
  args: {},
  returns: xRevocationTokens,
  handler: async (ctx) => {
    const { user } = await creatorContext(ctx);
    return await removeOwnXAccount(ctx, user);
  },
});
