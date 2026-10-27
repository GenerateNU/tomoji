import type { PaginationOptions, PaginationResult } from "convex/server";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { listCreatorNiches, updateCreatorNiches } from "./creatorNiches";
import { listCreatorSkills, updateCreatorSkills } from "./creatorSkills";
import { MAX_NICHES } from "./niches";
import { SKILLS } from "./skills";
import { getXAccountByCreatorId } from "./xAccountLookup";
import { requireCountry } from "./countries";
import { requireAdultBirthdate } from "../lib/birthdate";
import { MAX_ADDITIONAL_LINKS } from "../schemas/creators.schema";

export const creatorProfile = v.object({
  creatorId: v.id("creators"),
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  profilePictureMediaId: v.optional(v.id("mediaUploads")),
  xId: v.optional(v.string()),
  bannerMediaId: v.optional(v.id("mediaUploads")),
  githubLink: v.optional(v.string()),
  linkedinLink: v.optional(v.string()),
  additionalLinks: v.array(v.string()),
  dateOfBirth: v.optional(v.number()),
  countryOfResidence: v.optional(v.string()),
  isPrivate: v.boolean(),
  niches: v.array(v.string()),
  skills: v.array(v.string()),
});

export const creatorProfileUpdate = v.object({
  githubLink: v.optional(v.union(v.string(), v.null())),
  linkedinLink: v.optional(v.union(v.string(), v.null())),
  // An empty list clears them, same as niches.
  additionalLinks: v.optional(v.array(v.string())),
  dateOfBirth: v.optional(v.number()),
  countryOfResidence: v.optional(v.union(v.string(), v.null())),
  isPrivate: v.optional(v.boolean()),
  // Names from models/niches.ts. An empty list clears them.
  niches: v.optional(v.array(v.string())),
  skills: v.optional(v.array(v.string())),
});

export type CreatorProfile = Infer<typeof creatorProfile>;
export type CreatorProfileUpdate = Infer<typeof creatorProfileUpdate>;

// Each profile reads a user, creator, X account, and every selected niche/skill.
// Reserve half the 32,000-document budget and limit parallel profile lookups to 100.
const MAX_CREATOR_LIST_ROWS = Math.min(100, Math.floor(16_000 / (3 + MAX_NICHES + SKILLS.length)));

/** Combines matching user and creator documents into the user-facing creator profile. */
function toCreatorProfile(
  user: Doc<"users">,
  creator: Doc<"creators">,
  details: Pick<CreatorProfile, "xId" | "niches" | "skills">,
): CreatorProfile {
  return {
    creatorId: creator._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    profilePictureMediaId: user.profilePictureMediaId,
    xId: details.xId,
    bannerMediaId: creator.bannerMediaId,
    githubLink: creator.githubLink,
    linkedinLink: creator.linkedinLink,
    additionalLinks: creator.additionalLinks ?? [],
    dateOfBirth: creator.dateOfBirth,
    countryOfResidence: creator.countryOfResidence,
    isPrivate: creator.isPrivate,
    niches: details.niches,
    skills: details.skills,
  };
}

/** Loads the bounded associations and verified X identity for an already-authorized profile. */
async function getCreatorProfile(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  creator: Doc<"creators">,
): Promise<CreatorProfile> {
  const [account, niches, skills] = await Promise.all([
    getXAccountByCreatorId(ctx, creator._id),
    listCreatorNiches(ctx, creator),
    listCreatorSkills(ctx, creator._id),
  ]);
  return toCreatorProfile(user, creator, { xId: account?.xUserId, niches, skills });
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

/** True when the creator has a linked X account, an application, or an assignment. */
export async function hasCreatorActivity(
  ctx: QueryCtx | MutationCtx,
  creatorId: Id<"creators">,
): Promise<boolean> {
  if ((await getXAccountByCreatorId(ctx, creatorId)) !== null) return true;

  const application = await ctx.db
    .query("applications")
    .withIndex("by_creatorId_and_status", (q) => q.eq("creatorId", creatorId))
    .first();
  if (application !== null) return true;

  const assignment = await ctx.db
    .query("assignments")
    .withIndex("by_creatorId_and_status", (q) => q.eq("creatorId", creatorId))
    .first();
  return assignment !== null;
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

  return await getCreatorProfile(ctx, user, creator);
}

/** Returns one cursor-paginated page of active creator profiles. */
export async function listCreators(
  ctx: QueryCtx,
  options: { paginationOpts: PaginationOptions },
): Promise<PaginationResult<CreatorProfile>> {
  const users = await ctx.db
    .query("users")
    .withIndex("by_role_and_isActive", (q) => q.eq("role", "creator").eq("isActive", true))
    .paginate({
      ...options.paginationOpts,
      maximumRowsRead: Math.min(
        options.paginationOpts.maximumRowsRead ?? MAX_CREATOR_LIST_ROWS,
        MAX_CREATOR_LIST_ROWS,
      ),
    });

  // Bound the page before loading each creator's associated data.
  const page = await Promise.all(users.page.map((user) => requireCreatorProfile(ctx, user)));
  // Filtered after hydration rather than in the index, so a private creator
  // leaves a shorter page instead of being replaced by the next one.
  return { ...users, page: page.filter((profile) => !profile.isPrivate) };
}

/**
 * Whether a company already works with this creator. A private profile stays
 * reachable for them, because hiding someone a company is mid-campaign with
 * would break the review and assignment screens.
 */
async function hasCompanyRelationship(
  ctx: QueryCtx | MutationCtx,
  creatorId: Id<"creators">,
  companyId: Id<"companies">,
): Promise<boolean> {
  for await (const application of ctx.db
    .query("applications")
    .withIndex("by_creatorId_and_status", (q) => q.eq("creatorId", creatorId))) {
    if (application.companyId === companyId) return true;
  }
  for await (const assignment of ctx.db
    .query("assignments")
    .withIndex("by_creatorId_and_status", (q) => q.eq("creatorId", creatorId))) {
    if (assignment.companyId === companyId) return true;
  }
  return false;
}

/**
 * Trims and checks the free-form links on a profile.
 *
 * @throws `invalid_state` with `too_many_links` above the cap, or
 * `invalid_link` if one is not an https URL.
 */
export function requireAdditionalLinks(links: string[]): string[] {
  const trimmed = links.map((link) => link.trim()).filter((link) => link !== "");
  if (trimmed.length > MAX_ADDITIONAL_LINKS) {
    throw apiError("invalid_state", { reason: "too_many_links", max: MAX_ADDITIONAL_LINKS });
  }
  return trimmed.map((link) => {
    let url: URL;
    try {
      url = new URL(link);
    } catch {
      throw apiError("invalid_state", { reason: "invalid_link" });
    }
    // Rendered as an href, so anything but https is refused outright.
    if (url.protocol !== "https:" || url.username || url.password) {
      throw apiError("invalid_state", { reason: "invalid_link" });
    }
    return url.href;
  });
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

  const patch: Partial<Doc<"creators">> = {};
  if (updates.additionalLinks !== undefined) {
    patch.additionalLinks = requireAdditionalLinks(updates.additionalLinks);
  }
  if (updates.dateOfBirth !== undefined) {
    patch.dateOfBirth = requireAdultBirthdate(updates.dateOfBirth);
  }
  if (updates.isPrivate !== undefined) patch.isPrivate = updates.isPrivate;
  // Clients use null to clear a field because Convex cannot serialize undefined.
  if ("githubLink" in updates) patch.githubLink = updates.githubLink ?? undefined;
  if ("linkedinLink" in updates) patch.linkedinLink = updates.linkedinLink ?? undefined;
  if ("countryOfResidence" in updates) {
    patch.countryOfResidence =
      updates.countryOfResidence === null || updates.countryOfResidence === undefined
        ? undefined
        : requireCountry(updates.countryOfResidence);
  }

  const niches =
    updates.niches === undefined
      ? await listCreatorNiches(ctx, creator)
      : await updateCreatorNiches(ctx, creator._id, updates.niches);
  const skills =
    updates.skills === undefined
      ? await listCreatorSkills(ctx, creator._id)
      : await updateCreatorSkills(ctx, creator._id, updates.skills);
  await ctx.db.patch("creators", creator._id, patch);
  const account = await getXAccountByCreatorId(ctx, creator._id);
  return toCreatorProfile(
    user,
    { ...creator, ...patch },
    { xId: account?.xUserId, niches, skills },
  );
}

/** Returns a visible creator profile by creator ID or throws when it is unavailable. */
export async function requireCreatorProfileById(
  ctx: QueryCtx | MutationCtx,
  creatorId: Id<"creators">,
  viewingCompanyId?: Id<"companies">,
): Promise<CreatorProfile> {
  const creator = await ctx.db.get("creators", creatorId);
  if (creator === null) {
    throw apiError("not_found", { resource: "creator" });
  }

  const user = await ctx.db.get("users", creator.userId);
  if (user === null || !user.isActive || user.role !== "creator") {
    throw apiError("not_found", { resource: "creator" });
  }
  // `not_found` rather than `forbidden`, so a company cannot use this route to
  // discover that a private creator exists.
  if (
    creator.isPrivate &&
    viewingCompanyId !== undefined &&
    !(await hasCompanyRelationship(ctx, creatorId, viewingCompanyId))
  ) {
    throw apiError("not_found", { resource: "creator" });
  }

  return await getCreatorProfile(ctx, user, creator);
}
