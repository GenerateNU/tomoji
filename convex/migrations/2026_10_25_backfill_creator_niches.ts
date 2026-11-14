import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { updateCreatorNiches } from "../models/creatorNiches";
import { migrations } from "./runner";

/** Moves legacy niche arrays into association rows; already-migrated creators are unchanged. */
export async function migrateCreatorNiches(
  ctx: MutationCtx,
  creator: Doc<"creators">,
): Promise<void> {
  if (creator.niches === undefined) return;
  await updateCreatorNiches(ctx, creator._id, creator.niches);
}

export const backfillCreatorNiches = migrations.define({
  table: "creators",
  migrateOne: migrateCreatorNiches,
});
