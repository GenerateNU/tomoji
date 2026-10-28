import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { MAX_NICHES, requireNiches } from "./niches";

/** Reads legacy selections until backfilled, otherwise returns association names in selection order. */
export async function listCreatorNiches(
  ctx: QueryCtx | MutationCtx,
  creator: Doc<"creators">,
): Promise<string[]> {
  if (creator.niches !== undefined) return creator.niches;
  const rows = await ctx.db
    .query("creatorNiches")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creator._id))
    .take(MAX_NICHES);
  return rows.map((row) => row.name);
}

/** Replaces a creator's niche selections and removes the legacy array in the same transaction. */
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
  await ctx.db.patch("creators", creatorId, { niches: undefined });
  return niches;
}
