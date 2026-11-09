import { followerRangeFit, type FollowerRange } from "./followerRanges";

/**
 * How much each signal counts toward a match. Content types (0.15) and language
 * (0.15) join once creators and opportunities store them; signals an
 * opportunity doesn't ask for are left out and the rest re-normalized, so the
 * weights only need to be right relative to each other.
 */
export const SCORE_WEIGHTS = { niches: 0.35, skills: 0.25, followers: 0.1 } as const;

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
