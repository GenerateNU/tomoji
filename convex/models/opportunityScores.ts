import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { listCreatorNiches } from "./creatorNiches";
import { listCreatorSkills } from "./creatorSkills";
import { followerRangeFit, type FollowerRange } from "./followerRanges";
import { getVisibleOpportunityCompany } from "./opportunities";
import { listOpportunityNiches } from "./opportunityNiches";
import { listOpportunitySkills } from "./opportunitySkills";

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

/**
 * Company users keep the creator row made when they first signed in, and
 * deactivated users keep theirs; neither has a feed to rank.
 */
async function hasCreatorFeed(ctx: MutationCtx, creator: Doc<"creators">): Promise<boolean> {
  const user = await ctx.db.get("users", creator.userId);
  return user !== null && user.isActive && user.role === "creator";
}

async function getCreatorSignals(
  ctx: MutationCtx,
  creator: Doc<"creators">,
): Promise<CreatorSignals> {
  const [niches, skills] = await Promise.all([
    listCreatorNiches(ctx, creator),
    listCreatorSkills(ctx, creator._id),
  ]);
  return { niches, skills, followerRange: creator.followerRange };
}

async function getOpportunitySignals(
  ctx: MutationCtx,
  opportunity: Doc<"opportunities">,
): Promise<OpportunitySignals> {
  const [niches, skills] = await Promise.all([
    listOpportunityNiches(ctx, opportunity),
    listOpportunitySkills(ctx, opportunity._id),
  ]);
  return { niches, skills, minFollowerRange: opportunity.minFollowerRange };
}

async function getOpportunityScore(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  opportunityId: Id<"opportunities">,
): Promise<Doc<"opportunityScores"> | null> {
  return await ctx.db
    .query("opportunityScores")
    .withIndex("by_creatorId_and_opportunityId", (q) =>
      q.eq("creatorId", creatorId).eq("opportunityId", opportunityId),
    )
    .unique();
}

/**
 * Stores a score, writing only when it changed so feeds don't re-render for
 * nothing. A score of 0 is stored as no row, so the table only holds real matches.
 */
async function saveOpportunityScore(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  opportunityId: Id<"opportunities">,
  score: number,
): Promise<void> {
  const existing = await getOpportunityScore(ctx, creatorId, opportunityId);
  if (score === 0) {
    if (existing !== null) await ctx.db.delete("opportunityScores", existing._id);
  } else if (existing === null) {
    await ctx.db.insert("opportunityScores", { creatorId, opportunityId, score });
  } else if (existing.score !== score) {
    await ctx.db.patch("opportunityScores", existing._id, { score });
  }
}

const ROWS_PER_BATCH = 100;

/**
 * Where a batched scoring job stopped. A job runs the "existing" stage first,
 * then one stage per shared selection, named like "niche:ai-agents" or
 * "skill:python". Naming stages, rather than numbering them, keeps a job on
 * track when selections change between batches. Call again with `stage` and
 * `cursor` until `isDone`.
 */
export type ScoringProgress = { isDone: boolean; stage: string; cursor: string | null };

export const FIRST_STAGE = "existing";

const DONE: ScoringProgress = { isDone: true, stage: FIRST_STAGE, cursor: null };

/** The selection stages for these niches and skills, in the order they run. */
function selectionStages(selections: { niches: readonly string[]; skills: readonly string[] }) {
  return [
    ...selections.niches.map((name) => `niche:${name}`),
    ...selections.skills.map((name) => `skill:${name}`),
  ].sort();
}

/**
 * Stays on the stage to read its next page, or moves to the next stage once it
 * finishes. Stage names sort after "existing", so a stage whose selection was
 * removed mid-job still finds its successor.
 */
function advance(
  stage: string,
  stages: string[],
  page: { isDone: boolean; continueCursor: string },
): ScoringProgress {
  if (!page.isDone) return { isDone: false, stage, cursor: page.continueCursor };
  const next = stages.find((candidate) => candidate > stage);
  return next === undefined ? DONE : { isDone: false, stage: next, cursor: null };
}

const FINISHED_PAGE = { isDone: true, continueCursor: "" };

/**
 * Scores one opportunity for the creators it could match, a batch at a time.
 * The "existing" stage rescores creators who already have a score, since an
 * edit may have dropped them; each selection stage reads the creators who
 * picked that niche or skill, so the work grows with real matches rather than
 * with every creator. An opportunity that only sets a follower minimum has no
 * selections to look creators up by, so it isn't scored. If creators can no
 * longer see the opportunity, its scores are removed instead.
 */
export async function scoreOpportunityForCreators(
  ctx: MutationCtx,
  opportunityId: Id<"opportunities">,
  stage: string,
  cursor: string | null,
): Promise<ScoringProgress> {
  const opportunity = await ctx.db.get("opportunities", opportunityId);
  if (opportunity === null || (await getVisibleOpportunityCompany(ctx, opportunity)) === null) {
    const scores = await ctx.db
      .query("opportunityScores")
      .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
      .take(ROWS_PER_BATCH);
    for (const score of scores) await ctx.db.delete("opportunityScores", score._id);
    return scores.length < ROWS_PER_BATCH
      ? DONE
      : { isDone: false, stage: FIRST_STAGE, cursor: null };
  }

  const signals = await getOpportunitySignals(ctx, opportunity);
  const stages = selectionStages(signals);
  const rescore = async (creatorId: Id<"creators">) => {
    const creator = await ctx.db.get("creators", creatorId);
    const score =
      creator !== null && (await hasCreatorFeed(ctx, creator))
        ? scoreOpportunityMatch(await getCreatorSignals(ctx, creator), signals)
        : 0;
    await saveOpportunityScore(ctx, creatorId, opportunityId, score);
  };

  if (stage === FIRST_STAGE) {
    const page = await ctx.db
      .query("opportunityScores")
      .withIndex("by_opportunityId", (q) => q.eq("opportunityId", opportunityId))
      .paginate({ numItems: ROWS_PER_BATCH, cursor });
    for (const row of page.page) await rescore(row.creatorId);
    return advance(stage, stages, page);
  }
  if (!stages.includes(stage)) return advance(stage, stages, FINISHED_PAGE);

  // A creator who shares several selections is scored once per selection; the
  // repeat writes nothing because the score hasn't changed.
  const name = stage.slice(stage.indexOf(":") + 1);
  const page = stage.startsWith("niche:")
    ? await ctx.db
        .query("creatorNiches")
        .withIndex("by_name_and_creatorId", (q) => q.eq("name", name))
        .paginate({ numItems: ROWS_PER_BATCH, cursor })
    : await ctx.db
        .query("creatorSkills")
        .withIndex("by_name_and_creatorId", (q) => q.eq("name", name))
        .paginate({ numItems: ROWS_PER_BATCH, cursor });
  for (const row of page.page) await rescore(row.creatorId);
  return advance(stage, stages, page);
}

/**
 * Scores opportunities for one creator, e.g. after they edit their profile. The
 * "existing" stage rescores the opportunities they already have a score for,
 * dropping ones that closed or stopped matching; each selection stage reads the
 * opportunities that picked one of the creator's niches or skills, skipping
 * ones creators can't see. If the creator no longer has a feed, their scores
 * are removed.
 */
export async function scoreCreatorOpportunities(
  ctx: MutationCtx,
  creatorId: Id<"creators">,
  stage: string,
  cursor: string | null,
): Promise<ScoringProgress> {
  const creator = await ctx.db.get("creators", creatorId);
  if (creator === null || !(await hasCreatorFeed(ctx, creator))) {
    const scores = await ctx.db
      .query("opportunityScores")
      .withIndex("by_creatorId_and_opportunityId", (q) => q.eq("creatorId", creatorId))
      .take(ROWS_PER_BATCH);
    for (const score of scores) await ctx.db.delete("opportunityScores", score._id);
    return scores.length < ROWS_PER_BATCH
      ? DONE
      : { isDone: false, stage: FIRST_STAGE, cursor: null };
  }

  const signals = await getCreatorSignals(ctx, creator);
  const stages = selectionStages(signals);
  const rescore = async (opportunityId: Id<"opportunities">) => {
    const opportunity = await ctx.db.get("opportunities", opportunityId);
    const score =
      opportunity !== null && (await getVisibleOpportunityCompany(ctx, opportunity)) !== null
        ? scoreOpportunityMatch(signals, await getOpportunitySignals(ctx, opportunity))
        : 0;
    await saveOpportunityScore(ctx, creatorId, opportunityId, score);
  };

  if (stage === FIRST_STAGE) {
    // Paged by opportunity, not score, so rescoring doesn't reorder the rows
    // still to be read.
    const page = await ctx.db
      .query("opportunityScores")
      .withIndex("by_creatorId_and_opportunityId", (q) => q.eq("creatorId", creatorId))
      .paginate({ numItems: ROWS_PER_BATCH, cursor });
    for (const row of page.page) await rescore(row.opportunityId);
    return advance(stage, stages, page);
  }
  if (!stages.includes(stage)) return advance(stage, stages, FINISHED_PAGE);

  const name = stage.slice(stage.indexOf(":") + 1);
  const page = stage.startsWith("niche:")
    ? await ctx.db
        .query("opportunityNiches")
        .withIndex("by_name_and_opportunityId", (q) => q.eq("name", name))
        .paginate({ numItems: ROWS_PER_BATCH, cursor })
    : await ctx.db
        .query("opportunitySkills")
        .withIndex("by_name_and_opportunityId", (q) => q.eq("name", name))
        .paginate({ numItems: ROWS_PER_BATCH, cursor });
  for (const row of page.page) await rescore(row.opportunityId);
  return advance(stage, stages, page);
}
