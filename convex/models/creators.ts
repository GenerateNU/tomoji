import type { PaginationOptions, PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireNonBlank } from "../lib/validation";

export const creatorProfile = v.object({
  creatorId: v.id("creators"),
  username: v.optional(v.string()),
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  profilePicture: v.optional(v.string()),
  xId: v.optional(v.string()),
  githubLink: v.optional(v.string()),
  phoneNumber: v.optional(v.string()),
});

export const creatorProfileUpdate = v.object({
  username: v.optional(v.string()),
  xId: v.optional(v.union(v.string(), v.null())),
  githubLink: v.optional(v.union(v.string(), v.null())),
  phoneNumber: v.optional(v.union(v.string(), v.null())),
});

export type CreatorProfile = Infer<typeof creatorProfile>;
export type CreatorProfileUpdate = Infer<typeof creatorProfileUpdate>;

/** Combines matching user and creator documents into the user-facing creator profile. */
function toCreatorProfile(user: Doc<"users">, creator: Doc<"creators">): CreatorProfile {
  return {
    creatorId: creator._id,
    username: creator.username,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    profilePicture: user.profilePicture,
    xId: creator.xId,
    githubLink: creator.githubLink,
    phoneNumber: creator.phoneNumber,
  };
}

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

/** Returns the complete creator profile or throws when its data is missing. */
export async function requireCreatorProfile(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
): Promise<CreatorProfile> {
  const creator = await getCreatorByUserId(ctx, user._id);
  if (creator === null) {
    throw apiError("not_found", { resource: "creator" });
  }

  return toCreatorProfile(user, creator);
}

/** Returns one cursor-paginated page of active creator profiles. */
export async function listCreators(
  ctx: QueryCtx,
  options: { paginationOpts: PaginationOptions },
): Promise<PaginationResult<CreatorProfile>> {
  const users = await ctx.db
    .query("users")
    .withIndex("by_role_and_isActive", (q) => q.eq("role", "creator").eq("isActive", true))
    .paginate(options.paginationOpts);

  // Convex has no joins, so hydrate only the bounded page returned above.
  const page = await Promise.all(users.page.map((user) => requireCreatorProfile(ctx, user)));
  return { ...users, page };
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

  const patch: Partial<Pick<Doc<"creators">, "username" | "xId" | "githubLink" | "phoneNumber">> =
    {};
  if (updates.username !== undefined)
    patch.username = requireNonBlank(updates.username, "username");
  // Clients use null to clear a field because Convex cannot serialize undefined.
  if ("xId" in updates) patch.xId = updates.xId ?? undefined;
  if ("githubLink" in updates) patch.githubLink = updates.githubLink ?? undefined;
  if ("phoneNumber" in updates) patch.phoneNumber = updates.phoneNumber ?? undefined;

  await ctx.db.patch("creators", creator._id, patch);
  return toCreatorProfile(user, { ...creator, ...patch });
}

/** Returns a visible creator profile by creator ID or throws when it is unavailable. */
export async function requireCreatorProfileById(
  ctx: QueryCtx | MutationCtx,
  creatorId: Id<"creators">,
): Promise<CreatorProfile> {
  const creator = await ctx.db.get("creators", creatorId);
  if (creator === null) {
    throw apiError("not_found", { resource: "creator" });
  }

  const user = await ctx.db.get("users", creator.userId);
  if (user === null || !user.isActive || user.role !== "creator") {
    throw apiError("not_found", { resource: "creator" });
  }

  return toCreatorProfile(user, creator);
}
