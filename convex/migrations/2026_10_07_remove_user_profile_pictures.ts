import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { migrations } from "./runner";

/** Removes only the obsolete URL under a compatible schema, retaining the S3 media reference. */
export async function removeLegacyUserProfilePicture(
  ctx: MutationCtx,
  user: Doc<"users"> & { profilePicture?: string },
): Promise<void> {
  if (user.profilePicture === undefined) return;
  // The compatibility schema has this field; the final generated model does not.
  const patch: Partial<Doc<"users">> & { profilePicture?: string } = {
    profilePicture: undefined,
  };
  await ctx.db.patch("users", user._id, patch);
}

export const removeUserProfilePictures = migrations.define({
  table: "users",
  migrateOne: removeLegacyUserProfilePicture,
});
