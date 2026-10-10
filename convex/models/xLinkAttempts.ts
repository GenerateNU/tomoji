import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { getCreatorByUserId } from "./creators";
import { saveXAccount, type XAccountLink, type XAccount } from "./xAccounts";

export const xLinkAttemptTtlMs = 10 * 60_000;
export const xLinkStart = v.object({
  stateHash: v.string(),
  verifier: v.string(),
  redirectUri: v.string(),
});
export const xLinkClaim = v.object({
  attemptId: v.id("xLinkAttempts"),
  verifier: v.string(),
  redirectUri: v.string(),
});
export const xRevocationTokens = v.union(
  v.null(),
  v.object({ accessToken: v.string(), refreshToken: v.string() }),
);

/** Resolves the creator from an already-authorized caller. */
async function requireOwnCreator(ctx: QueryCtx | MutationCtx, user: Doc<"users">) {
  const creator = await getCreatorByUserId(ctx, user._id);
  if (creator === null) throw apiError("not_found", { resource: "creator" });
  return creator;
}

/** Replaces the creator's previous attempt, invalidating any older callback. */
export async function beginXLink(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: Infer<typeof xLinkStart>,
): Promise<Id<"xLinkAttempts">> {
  const creator = await requireOwnCreator(ctx, user);
  const previous = await ctx.db
    .query("xLinkAttempts")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creator._id))
    .unique();
  if (previous !== null) await ctx.db.delete("xLinkAttempts", previous._id);
  return await ctx.db.insert("xLinkAttempts", {
    ...args,
    creatorId: creator._id,
    expiresAt: Date.now() + xLinkAttemptTtlMs,
    status: "pending",
  });
}

/** Consumes state and PKCE material exactly once before any external request. */
export async function claimXLink(
  ctx: MutationCtx,
  user: Doc<"users">,
  stateHash: string,
): Promise<Infer<typeof xLinkClaim>> {
  const creator = await requireOwnCreator(ctx, user);
  const attempt = await ctx.db
    .query("xLinkAttempts")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creator._id))
    .unique();
  if (
    attempt === null ||
    attempt.stateHash !== stateHash ||
    attempt.expiresAt <= Date.now() ||
    attempt.status !== "pending" ||
    attempt.verifier === undefined
  ) {
    throw apiError("invalid_state", { reason: "x_link_invalid" });
  }
  await ctx.db.patch("xLinkAttempts", attempt._id, { status: "exchanging", verifier: undefined });
  return { attemptId: attempt._id, verifier: attempt.verifier, redirectUri: attempt.redirectUri };
}

/** Commits only a still-current claimed attempt, so disconnect/new-start wins races. */
export async function finishXLink(
  ctx: MutationCtx,
  user: Doc<"users">,
  attemptId: Id<"xLinkAttempts">,
  link: XAccountLink,
): Promise<XAccount> {
  const creator = await requireOwnCreator(ctx, user);
  const attempt = await ctx.db.get("xLinkAttempts", attemptId);
  if (
    attempt === null ||
    attempt.creatorId !== creator._id ||
    attempt.status !== "exchanging" ||
    attempt.expiresAt <= Date.now()
  ) {
    throw apiError("invalid_state", { reason: "x_link_invalid" });
  }
  const account = await saveXAccount(ctx, creator._id, link);
  await ctx.db.delete("xLinkAttempts", attemptId);
  return account;
}

/** Marks a consumed failed attempt without touching an existing connection. */
export async function failXLink(
  ctx: MutationCtx,
  user: Doc<"users">,
  attemptId: Id<"xLinkAttempts">,
): Promise<void> {
  const creator = await requireOwnCreator(ctx, user);
  const attempt = await ctx.db.get("xLinkAttempts", attemptId);
  if (attempt !== null && attempt.creatorId === creator._id) {
    await ctx.db.patch("xLinkAttempts", attemptId, { status: "failed", verifier: undefined });
  }
}

/** Removes expired PKCE material in one bounded scheduled mutation. */
export async function expireXLink(ctx: MutationCtx, attemptId: Id<"xLinkAttempts">): Promise<void> {
  const attempt = await ctx.db.get("xLinkAttempts", attemptId);
  if (attempt !== null && attempt.expiresAt <= Date.now())
    await ctx.db.delete("xLinkAttempts", attemptId);
}

/** Disconnects locally first and returns secrets only to the internal revocation action. */
export async function removeOwnXAccount(
  ctx: MutationCtx,
  user: Doc<"users">,
): Promise<Infer<typeof xRevocationTokens>> {
  const creator = await requireOwnCreator(ctx, user);
  const attempt = await ctx.db
    .query("xLinkAttempts")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creator._id))
    .unique();
  if (attempt !== null) await ctx.db.delete("xLinkAttempts", attempt._id);
  const account = await ctx.db
    .query("xAccounts")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creator._id))
    .unique();
  if (account === null) return null;
  const credentials = await ctx.db
    .query("xAccountCredentials")
    .withIndex("by_xAccountId", (q) => q.eq("xAccountId", account._id))
    .unique();
  if (credentials !== null) await ctx.db.delete("xAccountCredentials", credentials._id);
  await ctx.db.delete("xAccounts", account._id);
  return credentials === null
    ? null
    : { accessToken: credentials.accessToken, refreshToken: credentials.refreshToken };
}
