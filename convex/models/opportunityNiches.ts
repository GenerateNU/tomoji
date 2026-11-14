import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { MAX_NICHES, requireNiches } from "./niches";

/** Lists an opportunity's niches in selection order, bounded by `MAX_NICHES`. */
export async function listOpportunityNiches(
  ctx: QueryCtx | MutationCtx,
  opportunityId: Id<"opportunities">,
): Promise<string[]> {
  const rows = await ctx.db
    .query("opportunityNiches")
    .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
    .take(MAX_NICHES);
  return rows.map((row) => row.name);
}

/** Replaces an opportunity's validated niche selections without leaving duplicate rows. */
export async function updateOpportunityNiches(
  ctx: MutationCtx,
  opportunityId: Id<"opportunities">,
  names: string[],
): Promise<string[]> {
  const niches = requireNiches(names);
  const rows = await ctx.db
    .query("opportunityNiches")
    .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
    .take(MAX_NICHES);
  for (const row of rows) await ctx.db.delete("opportunityNiches", row._id);
  for (const name of niches) await ctx.db.insert("opportunityNiches", { opportunityId, name });
  return niches;
}

/** Matches one niche through the association index without reading the whole selection. */
export async function hasOpportunityNiche(
  ctx: QueryCtx,
  opportunityId: Id<"opportunities">,
  name: string,
): Promise<boolean> {
  return (
    (await ctx.db
      .query("opportunityNiches")
      .withIndex("by_name_and_opportunityId", (q) =>
        q.eq("name", name).eq("opportunityId", opportunityId),
      )
      .first()) !== null
  );
}
