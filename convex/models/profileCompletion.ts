import { v, type Infer } from "convex/values";
import type { OwnCreatorProfile } from "./creators";

// Kept free of database imports so the browser-test double can use the same rule.

/**
 * The profile items that count toward completion.
 * Every item weighs the same.
 * Links count as one item, since not every creator has a GitHub or LinkedIn.
 * Name and email are always set, so they are excluded.
 *
 * The banner and follower range are stored but nothing sets
 * them yet, we can add them here once/if the editor does.
 */
export const PROFILE_COMPLETION_ITEMS = [
  "profilePicture",
  "xAccount",
  "portfolioLink",
  "dateOfBirth",
  "countryOfResidence",
  "languages",
  "niches",
  "skills",
] as const;

export const profileCompletionItem = v.union(
  ...PROFILE_COMPLETION_ITEMS.map((item) => v.literal(item)),
);

export const profileCompletion = v.object({
  // Whole percent, 0 to 100.
  percent: v.number(),
  items: v.array(v.object({ item: profileCompletionItem, isComplete: v.boolean() })),
});

export type ProfileCompletion = Infer<typeof profileCompletion>;
type ProfileCompletionItem = (typeof PROFILE_COMPLETION_ITEMS)[number];

/**
 * Says which completion items a creator's own profile has filled.
 * `xConnected` comes from the X account's status: a linked
 * account whose access lapsed (`reconnect_required`) still sets `xId` but
 * doesn't count until the creator reconnects.
 */
export function measureProfileCompletion(
  profile: OwnCreatorProfile,
  { xConnected }: { xConnected: boolean },
): ProfileCompletion {
  const filled: Record<ProfileCompletionItem, boolean> = {
    profilePicture: profile.profilePictureMediaId !== undefined,
    xAccount: profile.xId !== undefined && xConnected,
    portfolioLink:
      profile.githubLink !== undefined ||
      profile.linkedinLink !== undefined ||
      profile.additionalLinks.length > 0,
    dateOfBirth: profile.dateOfBirth !== undefined,
    countryOfResidence: profile.countryOfResidence !== undefined,
    languages: profile.languages.length > 0,
    niches: profile.niches.length > 0,
    skills: profile.skills.length > 0,
  };
  const items = PROFILE_COMPLETION_ITEMS.map((item) => ({ item, isComplete: filled[item] }));
  const done = items.filter((entry) => entry.isComplete).length;
  return { percent: Math.round((done / items.length) * 100), items };
}
