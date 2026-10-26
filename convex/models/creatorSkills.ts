import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireSkills, SKILLS } from "./skills";

/** Lists a creator's skills in selection order, bounded by the predefined catalog. */
export async function listCreatorSkills(
  ctx: QueryCtx | MutationCtx,
  creatorId: Id<"creators">,
): Promise<string[]> {
  const rows = await ctx.db
    .query("creatorSkills")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creatorId))
    .take(SKILLS.length);
  return rows.map((row) => row.name);
}

/** Replaces a creator's validated skill selections without introducing duplicate rows. */
export async function updateCreatorSkills(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  names: string[],
): Promise<string[]> {
  const skills = requireSkills(names);
  const rows = await ctx.db
    .query("creatorSkills")
    .withIndex("by_creatorId", (q) => q.eq("creatorId", creatorId))
    .take(SKILLS.length);
  for (const row of rows) await ctx.db.delete("creatorSkills", row._id);
  for (const name of skills) await ctx.db.insert("creatorSkills", { creatorId, name });
  return skills;
}
