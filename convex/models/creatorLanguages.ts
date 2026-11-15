import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { MAX_LANGUAGES, requireLanguages } from "./languages";

/** Lists a creator's languages in selection order, bounded by `MAX_LANGUAGES`. */
export async function listCreatorLanguages(
  ctx: QueryCtx | MutationCtx,
  creatorId: Id<"creators">,
): Promise<string[]> {
  const rows = await ctx.db
    .query("creatorLanguages")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creatorId))
    .take(MAX_LANGUAGES);
  return rows.map((row) => row.name);
}

/** Replaces a creator's validated language selections without leaving duplicate rows. */
export async function updateCreatorLanguages(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  names: string[],
): Promise<string[]> {
  const languages = requireLanguages(names);
  const rows = await ctx.db
    .query("creatorLanguages")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creatorId))
    .take(MAX_LANGUAGES);
  for (const row of rows) await ctx.db.delete("creatorLanguages", row._id);
  for (const name of languages) await ctx.db.insert("creatorLanguages", { creatorId, name });
  return languages;
}
