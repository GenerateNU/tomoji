import type { PaginationOptions, PaginationResult } from "convex/server";
import { stream } from "convex-helpers/server/stream";
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { apiError } from "../lib/errors";
import { requireUrl } from "../lib/urls";
import { listCreatorLanguages, updateCreatorLanguages } from "./creatorLanguages";
import { listCreatorNiches, updateCreatorNiches } from "./creatorNiches";
import { listCreatorSkills, updateCreatorSkills } from "./creatorSkills";
import { MAX_NICHES } from "./niches";
import { SKILLS } from "./skills";
import { getXAccountByCreatorId } from "./xAccountLookup";
import { requireCountry } from "./countries";
import { requireAdultBirthdate } from "../lib/birthdate";
import schema from "../schema";
import { followerRange, MAX_ADDITIONAL_LINKS } from "../schemas/creators.schema";

/**
 * What anyone who may see a creator gets, companies included. Private fields
 * are added by `ownCreatorProfile` rather than stripped here, so a company
 * route cannot leak one by forgetting to.
 */
export const creatorProfile = v.object({
  creatorId: v.id("creators"),
  // When the creator row was made, in Unix ms; shown as "Joined November 2026".
  joinedAt: v.number(),
  firstName: v.string(),
  lastName: v.string(),
  email: v.string(),
  profilePictureMediaId: v.optional(v.id("mediaUploads")),
  xId: v.optional(v.string()),
  bannerMediaId: v.optional(v.id("mediaUploads")),
  githubLink: v.optional(v.string()),
  linkedinLink: v.optional(v.string()),
  additionalLinks: v.array(v.string()),
  countryOfResidence: v.optional(v.string()),
  niches: v.array(v.string()),
  skills: v.array(v.string()),
  languages: v.array(v.string()),
  followerRange: v.optional(followerRange),
});

/** The creator's own view, which adds what only they may read. */
export const ownCreatorProfile = v.object({
  ...creatorProfile.fields,
  // Their age gates the account; nobody else needs the date behind it.
  dateOfBirth: v.optional(v.number()),
  // Routes them into onboarding until it is set; not a company's business.
  onboardingCompletedAt: v.optional(v.number()),
});

export const creatorProfileUpdate = v.object({
  githubLink: v.optional(v.union(v.string(), v.null())),
  linkedinLink: v.optional(v.union(v.string(), v.null())),
  // An empty list clears them, same as niches.
  additionalLinks: v.optional(v.array(v.string())),
  dateOfBirth: v.optional(v.number()),
  countryOfResidence: v.optional(v.union(v.string(), v.null())),
  // Names from models/niches.ts. An empty list clears them.
  niches: v.optional(v.array(v.string())),
  skills: v.optional(v.array(v.string())),
  languages: v.optional(v.array(v.string())),
  // Null clears it, like the links.
  followerRange: v.optional(v.union(followerRange, v.null())),
});

export type CreatorProfile = Infer<typeof creatorProfile>;
export type OwnCreatorProfile = Infer<typeof ownCreatorProfile>;
export type CreatorProfileUpdate = Infer<typeof creatorProfileUpdate>;

// Each profile reads a user, creator, X account, and every selected niche/skill.
// Reserve half the 32,000-document budget and limit parallel profile lookups to 100.
const MAX_CREATOR_LIST_ROWS = Math.min(100, Math.floor(16_000 / (3 + MAX_NICHES + SKILLS.length)));

/** Combines matching user and creator documents into the shared profile. */
function toCreatorProfile(
  user: Doc<"users">,
  creator: Doc<"creators">,
  details: Pick<CreatorProfile, "xId" | "niches" | "skills" | "languages">,
): CreatorProfile {
  return {
    creatorId: creator._id,
    joinedAt: creator._creationTime,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    profilePictureMediaId: user.profilePictureMediaId,
    xId: details.xId,
    bannerMediaId: creator.bannerMediaId,
    githubLink: creator.githubLink,
    linkedinLink: creator.linkedinLink,
    additionalLinks: creator.additionalLinks ?? [],
    countryOfResidence: creator.countryOfResidence,
    niches: details.niches,
    skills: details.skills,
    languages: details.languages,
    followerRange: creator.followerRange,
  };
}

/** The same profile plus the creator's own private fields. */
function toOwnCreatorProfile(
  user: Doc<"users">,
  creator: Doc<"creators">,
  details: Pick<CreatorProfile, "xId" | "niches" | "skills" | "languages">,
): OwnCreatorProfile {
  return {
    ...toCreatorProfile(user, creator, details),
    dateOfBirth: creator.dateOfBirth,
    onboardingCompletedAt: creator.onboardingCompletedAt,
  };
}

/** Loads the bounded associations and verified X identity for an already-authorized profile. */
async function creatorDetails(
  ctx: QueryCtx | MutationCtx,
  creator: Doc<"creators">,
): Promise<Pick<CreatorProfile, "xId" | "niches" | "skills" | "languages">> {
  const [account, niches, skills, languages] = await Promise.all([
    getXAccountByCreatorId(ctx, creator._id),
    listCreatorNiches(ctx, creator._id),
    listCreatorSkills(ctx, creator._id),
    listCreatorLanguages(ctx, creator._id),
  ]);
  return { xId: account?.xUserId, niches, skills, languages };
}

async function getCreatorProfile(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  creator: Doc<"creators">,
): Promise<CreatorProfile> {
  return toCreatorProfile(user, creator, await creatorDetails(ctx, creator));
}

async function getOwnCreatorProfile(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
  creator: Doc<"creators">,
): Promise<OwnCreatorProfile> {
  return toOwnCreatorProfile(user, creator, await creatorDetails(ctx, creator));
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

/** Loads the creator row behind a user, or reports the pair as missing. */
async function requireCreatorRow(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
): Promise<Doc<"creators">> {
  const creator = await getCreatorByUserId(ctx, user._id);
  if (creator === null) {
    throw apiError("not_found", { resource: "creator" });
  }
  return creator;
}

/** Returns a creator's own complete profile, or throws when its data is missing. */
export async function requireCreatorProfile(
  ctx: QueryCtx | MutationCtx,
  user: Doc<"users">,
): Promise<OwnCreatorProfile> {
  return await getOwnCreatorProfile(ctx, user, await requireCreatorRow(ctx, user));
}

/** Returns one cursor-paginated page of active creator profiles. */
export async function listCreators(
  ctx: QueryCtx,
  options: { paginationOpts: PaginationOptions },
): Promise<PaginationResult<CreatorProfile>> {
  // Every scanned row hydrates its associations, so the scan is capped by the
  // document budget rather than the shared default.
  return await stream(ctx.db, schema)
    .query("users")
    .withIndex("by_role_and_isActive", (q) => q.eq("role", "creator").eq("isActive", true))
    .map(async (user) => await getCreatorProfile(ctx, user, await requireCreatorRow(ctx, user)))
    .paginate({
      ...options.paginationOpts,
      maximumRowsRead: Math.min(
        options.paginationOpts.maximumRowsRead ?? MAX_CREATOR_LIST_ROWS,
        MAX_CREATOR_LIST_ROWS,
      ),
    });
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
  return trimmed.map((link) => requireUrl(link, { reason: "invalid_link" }));
}

/** Clearing a link is allowed; keeping an unusable one is not. */
function optionalProfileUrl(
  value: string | null | undefined,
  rules: Parameters<typeof requireUrl>[1],
): string | undefined {
  if (value === null || value === undefined || value.trim() === "") return undefined;
  return requireUrl(value, rules);
}

/**
 * Marks onboarding finished, after checking the profile actually carries what
 * the flow collects. Checked here rather than trusted from the client, since
 * the flag is what stops the creator being routed back into onboarding.
 *
 * Connecting X is optional, so it is not required. Repeating the call keeps
 * the first completion time.
 *
 * @throws `invalid_state` with reason `onboarding_incomplete` and the missing
 * field names when something the flow collects is still unset.
 */
export async function completeCreatorOnboarding(
  ctx: MutationCtx,
  user: Doc<"users">,
): Promise<OwnCreatorProfile> {
  const creator = await requireCreatorRow(ctx, user);
  if (creator.onboardingCompletedAt !== undefined) {
    return toOwnCreatorProfile(user, creator, await creatorDetails(ctx, creator));
  }
  const [niches, skills, languages] = await Promise.all([
    listCreatorNiches(ctx, creator._id),
    listCreatorSkills(ctx, creator._id),
    listCreatorLanguages(ctx, creator._id),
  ]);
  const missing = [
    ...(creator.dateOfBirth === undefined ? ["dateOfBirth"] : []),
    ...(creator.countryOfResidence === undefined ? ["countryOfResidence"] : []),
    ...(languages.length === 0 ? ["languages"] : []),
    ...(niches.length === 0 ? ["niches"] : []),
    ...(skills.length === 0 ? ["skills"] : []),
  ];
  if (missing.length > 0) {
    throw apiError("invalid_state", { reason: "onboarding_incomplete", missing });
  }
  const onboardingCompletedAt = Date.now();
  await ctx.db.patch("creators", creator._id, { onboardingCompletedAt });
  return toOwnCreatorProfile(
    user,
    { ...creator, onboardingCompletedAt },
    await creatorDetails(ctx, creator),
  );
}

/** Updates the editable fields in a creator's own profile and returns the complete profile. */
export async function updateCreatorProfile(
  ctx: MutationCtx,
  user: Doc<"users">,
  updates: CreatorProfileUpdate,
): Promise<OwnCreatorProfile> {
  const creator = await requireCreatorRow(ctx, user);

  const patch: Partial<Doc<"creators">> = {};
  if (updates.additionalLinks !== undefined) {
    patch.additionalLinks = requireAdditionalLinks(updates.additionalLinks);
  }
  if (updates.dateOfBirth !== undefined) {
    patch.dateOfBirth = requireAdultBirthdate(updates.dateOfBirth);
  }
  if (updates.followerRange !== undefined) {
    patch.followerRange = updates.followerRange ?? undefined;
  }
  // Clients use null to clear a field because Convex cannot serialize undefined.
  if ("githubLink" in updates) {
    patch.githubLink = optionalProfileUrl(updates.githubLink, {
      reason: "invalid_github_link",
      hosts: ["github.com"],
    });
  }
  if ("linkedinLink" in updates) {
    patch.linkedinLink = optionalProfileUrl(updates.linkedinLink, {
      reason: "invalid_linkedin_link",
      hosts: ["linkedin.com"],
    });
  }
  if ("countryOfResidence" in updates) {
    patch.countryOfResidence =
      updates.countryOfResidence === null || updates.countryOfResidence === undefined
        ? undefined
        : requireCountry(updates.countryOfResidence);
  }

  const niches =
    updates.niches === undefined
      ? await listCreatorNiches(ctx, creator._id)
      : await updateCreatorNiches(ctx, creator._id, updates.niches);
  const skills =
    updates.skills === undefined
      ? await listCreatorSkills(ctx, creator._id)
      : await updateCreatorSkills(ctx, creator._id, updates.skills);
  const languages =
    updates.languages === undefined
      ? await listCreatorLanguages(ctx, creator._id)
      : await updateCreatorLanguages(ctx, creator._id, updates.languages);
  await ctx.db.patch("creators", creator._id, patch);
  const account = await getXAccountByCreatorId(ctx, creator._id);
  return toOwnCreatorProfile(
    user,
    { ...creator, ...patch },
    { xId: account?.xUserId, niches, skills, languages },
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
  return await getCreatorProfile(ctx, user, creator);
}
