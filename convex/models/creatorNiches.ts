import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { MAX_NICHES, requireNiches } from "./niches";

/** Lists a creator's niches in selection order, bounded by `MAX_NICHES`. */
export async function listCreatorNiches(
  ctx: QueryCtx | MutationCtx,
  creatorId: Id<"creators">,
): Promise<string[]> {
  const rows = await ctx.db
    .query("creatorNiches")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creatorId))
    .take(MAX_NICHES);
  return rows.map((row) => row.name);
}

/** Replaces a creator's validated niche selections without leaving duplicate rows. */
export async function updateCreatorNiches(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  names: string[],
): Promise<string[]> {
  const niches = requireNiches(names);
  const rows = await ctx.db
    .query("creatorNiches")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creatorId))
    .take(MAX_NICHES);
  for (const row of rows) await ctx.db.delete("creatorNiches", row._id);
  for (const name of niches) await ctx.db.insert("creatorNiches", { creatorId, name });
  return niches;
}
