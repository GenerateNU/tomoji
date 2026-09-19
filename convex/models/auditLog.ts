import type { Value } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * Any mutation context from the `*Mutation` builders, which all supply `user`.
 * `viaApiKey` is unset today; when API keys land the builder adds it and no
 * call site changes.
 */
type AuditCtx = MutationCtx & { user: Doc<"users">; viaApiKey?: string };

export type AuditEntry = {
  action: string;
  targetTable: string;
  targetId: string;
  metadata?: Record<string, Value>;
};

/** Records one intentional user action. Call from routes, not models. */
export async function logAction(ctx: AuditCtx, entry: AuditEntry): Promise<void> {
  await ctx.db.insert("auditLog", {
    userId: ctx.user._id,
    viaApiKey: ctx.viaApiKey,
    ...entry,
  });
}

/** Everything a user has done, newest first. */
export async function listActionsByUser(
  ctx: MutationCtx,
  userId: Doc<"users">["_id"],
  limit = 100,
): Promise<Doc<"auditLog">[]> {
  return await ctx.db
    .query("auditLog")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .order("desc")
    .take(limit);
}

/** Everything that has happened to one row, newest first. */
export async function listActionsOnTarget(
  ctx: MutationCtx,
  targetTable: string,
  targetId: string,
  limit = 100,
): Promise<Doc<"auditLog">[]> {
  return await ctx.db
    .query("auditLog")
    .withIndex("by_target", (q) => q.eq("targetTable", targetTable).eq("targetId", targetId))
    .order("desc")
    .take(limit);
}
