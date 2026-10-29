import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireSkills, SKILLS } from "./skills";

/** Lists an opportunity's skills in selection order, bounded by the predefined catalog. */
export async function listOpportunitySkills(
  ctx: QueryCtx | MutationCtx,
  opportunityId: Id<"opportunities">,
): Promise<string[]> {
  const rows = await ctx.db
    .query("opportunitySkills")
    .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
    .take(SKILLS.length);
  return rows.map((row) => row.name);
}

/** Replaces an opportunity's validated skill selections without introducing duplicate rows. */
export async function updateOpportunitySkills(
  ctx: MutationCtx,
  opportunityId: Id<"opportunities">,
  names: string[],
): Promise<string[]> {
  const skills = requireSkills(names);
  const rows = await ctx.db
    .query("opportunitySkills")
    .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
    .take(SKILLS.length);
  for (const row of rows) await ctx.db.delete("opportunitySkills", row._id);
  for (const name of skills) await ctx.db.insert("opportunitySkills", { opportunityId, name });
  return skills;
}
