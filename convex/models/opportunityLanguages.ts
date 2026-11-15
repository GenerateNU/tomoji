import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { MAX_LANGUAGES, requireLanguages } from "./languages";

/** Lists an opportunity's languages in selection order, bounded by `MAX_LANGUAGES`. */
export async function listOpportunityLanguages(
  ctx: QueryCtx | MutationCtx,
  opportunityId: Id<"opportunities">,
): Promise<string[]> {
  const rows = await ctx.db
    .query("opportunityLanguages")
    .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
    .take(MAX_LANGUAGES);
  return rows.map((row) => row.name);
}

/** Replaces an opportunity's validated language selections without leaving duplicate rows. */
export async function updateOpportunityLanguages(
  ctx: MutationCtx,
  opportunityId: Id<"opportunities">,
  names: string[],
): Promise<string[]> {
  const languages = requireLanguages(names);
  const rows = await ctx.db
    .query("opportunityLanguages")
    .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
    .take(MAX_LANGUAGES);
  for (const row of rows) await ctx.db.delete("opportunityLanguages", row._id);
  for (const name of languages) {
    await ctx.db.insert("opportunityLanguages", { opportunityId, name });
  }
  return languages;
}
