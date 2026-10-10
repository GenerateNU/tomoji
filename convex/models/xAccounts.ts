import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";
import { xAccountStatus } from "../schemas/xAccounts.schema";

// X's user-lookup scope mapping requires both read scopes; offline.access
// requests the refresh token needed to keep the connection usable later.
export const X_ACCOUNT_SCOPES = ["tweet.read", "users.read", "offline.access"] as const;

export const xAccount = v.object({
  xAccountId: v.id("xAccounts"),
  xUserId: v.string(),
  username: v.string(),
  displayName: v.string(),
  linkedAt: v.number(),
  updatedAt: v.number(),
  status: xAccountStatus,
});

export const xAccountLink = v.object({
  xUserId: v.string(),
  username: v.string(),
  displayName: v.string(),
  accessToken: v.string(),
  refreshToken: v.string(),
  accessTokenExpiresAt: v.number(),
  scopes: v.array(v.string()),
});

export type XAccount = Infer<typeof xAccount>;
export type XAccountLink = Infer<typeof xAccountLink>;

/** Projects stored account metadata without credentials or internal ownership fields. */
function toXAccount(account: Doc<"xAccounts">): XAccount {
  return {
    xAccountId: account._id,
    xUserId: account.xUserId,
    username: account.username,
    displayName: account.displayName,
    linkedAt: account.linkedAt,
    updatedAt: account.updatedAt,
    status: account.status,
  };
}

/** Returns only user-facing metadata for one creator's linked X account. */
export async function getXAccount(
  ctx: QueryCtx | MutationCtx,
  creatorId: Id<"creators">,
): Promise<XAccount | null> {
  const account = await ctx.db
    .query("xAccounts")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creatorId))
    .unique();
  return account === null ? null : toXAccount(account);
}

/** Resolves a caller's creator row before returning their safe linked-account view. */
export async function getOwnXAccount(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
): Promise<XAccount | null> {
  const creator = await ctx.db
    .query("creators")
    .withIndex("by_userId", (q) => q.eq("userId", user._id))
    .unique();
  if (creator === null) throw apiError("not_found", { resource: "creator" });
  return await getXAccount(ctx, creator._id);
}

/**
 * Persists server-verified X data atomically. Only the OAuth completion path may
 * call this helper; never accept this payload through a public mutation.
 */
export async function saveXAccount(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  link: XAccountLink,
): Promise<XAccount> {
  const creator = await ctx.db.get("creators", creatorId);
  if (creator === null) throw apiError("not_found", { resource: "creator" });
  const user = await ctx.db.get("users", creator.userId);
  if (user === null || !user.isActive || user.role !== "creator") {
    throw apiError("not_found", { resource: "creator" });
  }
  if (!/^\d+$/.test(link.xUserId)) {
    throw apiError("invalid_state", { reason: "x_user_id_invalid" });
  }
  if (!Number.isFinite(link.accessTokenExpiresAt) || link.accessTokenExpiresAt <= Date.now()) {
    throw apiError("invalid_state", { reason: "x_token_expired" });
  }
  requireNonBlank(link.accessToken, "accessToken");
  requireNonBlank(link.refreshToken, "refreshToken");
  if (!X_ACCOUNT_SCOPES.every((scope) => link.scopes.includes(scope))) {
    throw apiError("invalid_state", { reason: "x_scopes_missing" });
  }

  const existing = await ctx.db
    .query("xAccounts")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creatorId))
    .unique();
  const owner = await ctx.db
    .query("xAccounts")
    .withIndex("by_xUserId", (q) => q.eq("xUserId", link.xUserId))
    .unique();
  if (owner !== null && owner.creatorId !== creatorId) {
    throw apiError("conflict", { reason: "x_account_linked" });
  }

  const now = Date.now();
  const fields = {
    creatorId,
    xUserId: link.xUserId,
    username: requireNonBlank(link.username, "xUsername"),
    displayName: requireNonBlank(link.displayName, "xDisplayName"),
    linkedAt: existing?.xUserId === link.xUserId ? existing.linkedAt : now,
    updatedAt: now,
    status: "connected" as const,
  };
  const accountId = existing?._id ?? (await ctx.db.insert("xAccounts", fields));
  if (existing !== null) await ctx.db.replace("xAccounts", accountId, fields);
  const credentials = await ctx.db
    .query("xAccountCredentials")
    .withIndex("by_xAccountId", (q) => q.eq("xAccountId", accountId))
    .unique();
  const credentialFields = {
    xAccountId: accountId,
    accessToken: link.accessToken,
    refreshToken: link.refreshToken,
    accessTokenExpiresAt: link.accessTokenExpiresAt,
    scopes: [...new Set(link.scopes)],
    credentialVersion: (credentials?.credentialVersion ?? 0) + 1,
  };
  if (credentials === null) await ctx.db.insert("xAccountCredentials", credentialFields);
  else await ctx.db.replace("xAccountCredentials", credentials._id, credentialFields);
  return toXAccount({ ...fields, _id: accountId, _creationTime: existing?._creationTime ?? now });
}
