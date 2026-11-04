import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { updateOpportunityNiches } from "../models/opportunityNiches";
import { migrations } from "./runner";

/** Moves legacy niche arrays into association rows without changing opportunity terms or status. */
export async function migrateOpportunityNiches(
  ctx: MutationCtx,
  opportunity: Doc<"opportunities">,
): Promise<void> {
  if (opportunity.niches === undefined) return;
  await updateOpportunityNiches(ctx, opportunity._id, opportunity.niches);
}

export const backfillOpportunityNiches = migrations.define({
  table: "opportunities",
  migrateOne: migrateOpportunityNiches,
});
