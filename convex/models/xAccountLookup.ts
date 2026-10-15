import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Reads verified metadata without depending on creator profile assembly. */
export async function getXAccountByCreatorId(
  ctx: QueryCtx | MutationCtx,
  creatorId: Id<"creators">,
): Promise<Doc<"xAccounts"> | null> {
  return await ctx.db
    .query("xAccounts")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creatorId))
    .unique();
}
