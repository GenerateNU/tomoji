import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { listCreatorNiches } from "./creatorNiches";
import { listCreatorSkills } from "./creatorSkills";
import { followerRangeFit, type FollowerRange } from "./followerRanges";

/**
 * How much each signal counts toward a match. Followers weigh most because reach
 * decides eligibility; niches least because briefs may not set them. Signals an
 * opportunity doesn't ask for are left out and the rest re-normalized, so the
 * weights only need to be right relative to each other.
 */
export const SCORE_WEIGHTS = { followers: 0.45, skills: 0.35, niches: 0.2 } as const;

export type CreatorSignals = {
  niches: readonly string[];
  skills: readonly string[];
  followerRange?: FollowerRange;
};

export type OpportunitySignals = {
  niches: readonly string[];
  skills: readonly string[];
  minFollowerRange?: FollowerRange;
};

/** Share of the opportunity's selections the creator also has. */
function overlap(wanted: readonly string[], offered: readonly string[]): number {
  const offeredSet = new Set(offered);
  return wanted.filter((name) => offeredSet.has(name)).length / wanted.length;
}

/**
 * Scores how well an opportunity fits a creator, from 0 to 1. Only signals the
 * opportunity asks for count, so a brief with no skills isn't marked down for
 * it. A brief that asks for nothing scores 0 and falls back to deadline order.
 */
export function scoreOpportunityMatch(
  creator: CreatorSignals,
  opportunity: OpportunitySignals,
): number {
  let total = 0;
  let weight = 0;
  if (opportunity.niches.length > 0) {
    total += SCORE_WEIGHTS.niches * overlap(opportunity.niches, creator.niches);
    weight += SCORE_WEIGHTS.niches;
  }
  if (opportunity.skills.length > 0) {
    total += SCORE_WEIGHTS.skills * overlap(opportunity.skills, creator.skills);
    weight += SCORE_WEIGHTS.skills;
  }
  // An under-1K minimum excludes nobody, so it isn't a requirement.
  if (opportunity.minFollowerRange !== undefined && opportunity.minFollowerRange !== "under-1k") {
    total +=
      SCORE_WEIGHTS.followers *
      followerRangeFit(creator.followerRange, opportunity.minFollowerRange);
    weight += SCORE_WEIGHTS.followers;
  }
  return weight === 0 ? 0 : total / weight;
}

/** A creator's niches, skills, and reach, as matching reads them. */
export async function getCreatorSignals(
  ctx: QueryCtx | MutationCtx,
  creator: Doc<"creators">,
): Promise<CreatorSignals> {
  const [niches, skills] = await Promise.all([
    listCreatorNiches(ctx, creator._id),
    listCreatorSkills(ctx, creator._id),
  ]);
  return { niches, skills, followerRange: creator.followerRange };
}

/**
 * How well a brief fits the creator, in terms they can act on. `level` is null
 * when the brief asks for nothing to match on. A creator is eligible when they
 * meet the follower minimum and have every skill the brief asks for; anyone
 * may still apply or claim, so this only informs.
 */
export const opportunityMatch = v.object({
  level: v.union(v.literal("strong"), v.literal("good"), v.literal("weak"), v.null()),
  matchedSkills: v.array(v.string()),
  missingSkills: v.array(v.string()),
  matchedNiches: v.array(v.string()),
  // Null when the brief sets no minimum.
  meetsFollowerMinimum: v.union(v.boolean(), v.null()),
  isEligible: v.boolean(),
});
export type OpportunityMatch = Infer<typeof opportunityMatch>;

/** Scores at or above these read as a strong or good match; anything lower is weak. */
const MATCH_LEVELS = { strong: 0.75, good: 0.4 } as const;

export function describeMatch(
  creator: CreatorSignals,
  opportunity: OpportunitySignals,
): OpportunityMatch {
  const has = (offered: readonly string[]) => (name: string) => offered.includes(name);
  const asksForFollowers =
    opportunity.minFollowerRange !== undefined && opportunity.minFollowerRange !== "under-1k";
  const asksForAnything =
    opportunity.niches.length > 0 || opportunity.skills.length > 0 || asksForFollowers;
  const score = scoreOpportunityMatch(creator, opportunity);
  const meetsFollowerMinimum =
    opportunity.minFollowerRange === undefined
      ? null
      : followerRangeFit(creator.followerRange, opportunity.minFollowerRange) === 1;
  const missingSkills = opportunity.skills.filter((name) => !has(creator.skills)(name));
  return {
    level: !asksForAnything
      ? null
      : score >= MATCH_LEVELS.strong
        ? "strong"
        : score >= MATCH_LEVELS.good
          ? "good"
          : "weak",
    matchedSkills: opportunity.skills.filter(has(creator.skills)),
    missingSkills,
    matchedNiches: opportunity.niches.filter(has(creator.niches)),
    meetsFollowerMinimum,
    isEligible: meetsFollowerMinimum !== false && missingSkills.length === 0,
  };
}
