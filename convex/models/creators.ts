import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";

export const creatorProfile = v.object({
  creatorId: v.id("creators"),
  name: v.string(),
  email: v.string(),
  profilePicture: v.optional(v.string()),
  xId: v.optional(v.string()),
  githubLink: v.optional(v.string()),
  phoneNumber: v.optional(v.string()),
});

export const creatorProfileUpdate = v.object({
  xId: v.optional(v.union(v.string(), v.null())),
  githubLink: v.optional(v.union(v.string(), v.null())),
  phoneNumber: v.optional(v.union(v.string(), v.null())),
});

export type CreatorProfile = Infer<typeof creatorProfile>;
export type CreatorProfileUpdate = Infer<typeof creatorProfileUpdate>;

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

/** Updates the editable fields in a creator's own profile and returns the complete profile. */
export async function updateCreatorProfile(
  ctx: MutationCtx,
  user: Doc<"users">,
  updates: CreatorProfileUpdate,
): Promise<CreatorProfile> {
  const creator = await getCreatorByUserId(ctx, user._id);
  if (creator === null) {
    throw apiError("not_found", { resource: "creator" });
  }

  const patch: Pick<Doc<"creators">, "xId" | "githubLink" | "phoneNumber"> = {};
  // Clients use null to clear a field because Convex cannot serialize undefined.
  if ("xId" in updates) patch.xId = updates.xId ?? undefined;
  if ("githubLink" in updates) patch.githubLink = updates.githubLink ?? undefined;
  if ("phoneNumber" in updates) patch.phoneNumber = updates.phoneNumber ?? undefined;

  await ctx.db.patch("creators", creator._id, patch);
  const updatedCreator = { ...creator, ...patch };
  return {
    creatorId: updatedCreator._id,
    name: user.name,
    email: user.email,
    profilePicture: user.profilePicture,
    xId: updatedCreator.xId,
    githubLink: updatedCreator.githubLink,
    phoneNumber: updatedCreator.phoneNumber,
  };
}
