import type { Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { creatorProfile } from "../schemas/creators.schema";

export type CreatorProfile = Infer<typeof creatorProfile>;

/** Finds the creator row associated with a user. */
export async function getCreatorByUserId(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"creators"> | null> {
  return await ctx.db
    .query("creators")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

/** Returns all user-facing creator profile fields or throws when the profile does not exist. */
export async function requireCreatorProfile(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
): Promise<CreatorProfile> {
  if (user.role !== "creator") {
    throw apiError("forbidden", { requiredRole: "creator" });
  }

  const creator = await getCreatorByUserId(ctx, user._id);
  if (creator === null) {
    throw apiError("not_found", { resource: "creator" });
  }

  return {
    creatorId: creator._id,
    name: user.name,
    email: user.email,
    profilePicture: user.profilePicture,
    xId: creator.xId,
    githubLink: creator.githubLink,
    phoneNumber: creator.phoneNumber,
  };
}
