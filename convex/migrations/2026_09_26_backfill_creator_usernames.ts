import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireAvailableCreatorUsername } from "../models/creators";
import { migrations } from "./runner";

/** Fills missing usernames and replaces legacy ID-based names, preserving other choices. */
export async function migrateCreatorUsername(
  ctx: MutationCtx,
  creator: Doc<"creators">,
): Promise<void> {
  if (creator.username !== undefined && creator.username !== `creator_${creator.userId}`) return;

  const characters = "0123456789abcdefghijklmnopqrstuvwxyz";
  for (let attempt = 0; attempt < 5; attempt++) {
    // Convex seeds Math.random() per mutation so transaction retries are reproducible.
    const suffix = Array.from(
      { length: 12 },
      () => characters[Math.floor(Math.random() * characters.length)],
    ).join("");
    let username: string;
    try {
      username = await requireAvailableCreatorUsername(ctx, creator._id, `creator_${suffix}`);
    } catch (error) {
      if (
        error instanceof ConvexError &&
        error.data?.code === "conflict" &&
        error.data?.reason === "username_taken"
      ) {
        continue;
      }
      throw error;
    }
    await ctx.db.patch("creators", creator._id, { username });
    return;
  }
  throw apiError("conflict", { reason: "username_generation_failed" });
}

export const backfillCreatorUsernames = migrations.define({
  table: "creators",
  migrateOne: migrateCreatorUsername,
});
