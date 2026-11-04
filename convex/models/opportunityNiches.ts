import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { MAX_NICHES, requireNiches } from "./niches";

/** Reads legacy selections until backfilled, otherwise returns association names in selection order. */
export async function listOpportunityNiches(
  ctx: QueryCtx | MutationCtx,
  opportunity: Doc<"opportunities">,
): Promise<string[]> {
  if (opportunity.niches !== undefined) return opportunity.niches;
  const rows = await ctx.db
    .query("opportunityNiches")
    .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunity._id))
    .take(MAX_NICHES);
  return rows.map((row) => row.name);
}

/** Replaces an opportunity's niche selections and removes the legacy array in the same transaction. */
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
  await ctx.db.patch("opportunities", opportunityId, { niches: undefined });
  return niches;
}

/** Matches one niche through the association index, preserving legacy-array compatibility. */
export async function hasOpportunityNiche(
  ctx: QueryCtx,
  opportunity: Doc<"opportunities">,
  name: string,
): Promise<boolean> {
  if (opportunity.niches !== undefined) return opportunity.niches.includes(name);
  return (
    (await ctx.db
      .query("opportunityNiches")
      .withIndex("by_name_and_opportunityId", (q) =>
        q.eq("name", name).eq("opportunityId", opportunity._id),
      )
      .first()) !== null
  );
}
