import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import {
  authedQuery,
  companyMutation,
  companyQuery,
  creatorMutation,
  creatorQuery,
} from "./lib/functions";
import { findOrgId } from "./lib/identity";
import {
  closeOpportunity,
  closeExpiredOpportunities,
  notifyWaitingApplicantsBatch,
  createOpportunity,
  discoverOpportunities,
  getOpportunity,
  getOpportunityView,
  opportunityView,
  listOpportunities,
  opportunityCreate,
  opportunityDiscover,
  opportunityList,
  opportunityUpdate,
  pauseOpportunity,
  publishOpportunity,
  removeOpportunity,
  resumeOpportunity,
  updateOpportunity,
} from "./models/opportunities";
import {
  isOpportunityStarred,
  listStarredOpportunities,
  starOpportunity,
  starredCreatorOpportunity,
  starredOpportunityList,
  unstarOpportunity,
  withStarredFlags,
} from "./models/opportunityStars";
import { hasOpportunityScores } from "./models/opportunityScores";
import { requireCallerCreatorId } from "./models/users";

/** Rescores the opportunity for creators in the background, or clears its scores once closed. */
async function scheduleScoring(ctx: MutationCtx, opportunityId: Id<"opportunities">) {
  await ctx.scheduler.runAfter(0, internal.opportunityScores.scoreOpportunity, { opportunityId });
}

/** Clears a closed opportunity's scores, skipping the job when it has none. */
async function scheduleScoreCleanup(ctx: MutationCtx, opportunityId: Id<"opportunities">) {
  if (await hasOpportunityScores(ctx, opportunityId)) await scheduleScoring(ctx, opportunityId);
}

/** Closes an owned published opportunity permanently without cancelling existing assignments. */
export const close = companyMutation({
  args: { opportunityId: v.id("opportunities") },
  returns: opportunityView,
  handler: async (ctx, { opportunityId }) => {
    const opportunity = await closeOpportunity(ctx, ctx.membership, opportunityId);
    await scheduleScoreCleanup(ctx, opportunityId);
    return await getOpportunityView(ctx, opportunity);
  },
});

/** Drains overdue opportunities in bounded transactions for the deadline cron. */
export const closeExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { closedIds, hasMore } = await closeExpiredOpportunities(ctx);
    for (const opportunityId of closedIds) await scheduleScoreCleanup(ctx, opportunityId);
    if (hasMore) await ctx.scheduler.runAfter(0, internal.opportunities.closeExpired, {});
    return null;
  },
});

/**
 * Tells one batch of waiting applicants that the opportunity closed and
 * reschedules itself while more remain. Enqueued by every close, manual or at
 * the deadline, because an opportunity's applications are unbounded.
 */
export const notifyClosed = internalMutation({
  args: { opportunityId: v.id("opportunities"), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cursor = await notifyWaitingApplicantsBatch(ctx, args.opportunityId, args.cursor);
    if (cursor !== null) {
      await ctx.scheduler.runAfter(0, internal.opportunities.notifyClosed, {
        opportunityId: args.opportunityId,
        cursor,
      });
    }
    return null;
  },
});

/** Pauses an open opportunity owned by the caller's company, preserving existing workflow records. */
export const pause = companyMutation({
  args: { opportunityId: v.id("opportunities") },
  returns: opportunityView,
  handler: async (ctx, { opportunityId }) => {
    return await getOpportunityView(
      ctx,
      await pauseOpportunity(ctx, ctx.membership, opportunityId),
    );
  },
});

/** Resumes a paused opportunity in an open campaign before its deadline. */
export const resume = companyMutation({
  args: { opportunityId: v.id("opportunities") },
  returns: opportunityView,
  handler: async (ctx, { opportunityId }) => {
    return await getOpportunityView(
      ctx,
      await resumeOpportunity(ctx, ctx.membership, opportunityId),
    );
  },
});

/** Publishes a draft with at least one deliverable in an open campaign the company owns. */
export const publish = companyMutation({
  args: { opportunityId: v.id("opportunities") },
  returns: opportunityView,
  handler: async (ctx, { opportunityId }) => {
    const opportunity = await publishOpportunity(ctx, ctx.membership, opportunityId);
    await scheduleScoring(ctx, opportunityId);
    return await getOpportunityView(ctx, opportunity);
  },
});

/** Removes a draft owned by the caller's company only when it has no workflow history. */
export const remove = companyMutation({
  args: { opportunityId: v.id("opportunities") },
  returns: v.null(),
  handler: async (ctx, { opportunityId }) => {
    await removeOpportunity(ctx, ctx.membership, opportunityId);
    return null;
  },
});

/** Updates editable opportunity fields for the caller's company, preserving assignment terms. */
export const update = companyMutation({
  args: { opportunityId: v.id("opportunities"), ...opportunityUpdate.fields },
  returns: opportunityView,
  handler: async (ctx, { opportunityId, ...updates }) => {
    const opportunity = await updateOpportunity(ctx, ctx.membership, opportunityId, updates);
    // Drafts have no scores; publishing scores them.
    const { niches, skills, minFollowerRange } = updates;
    const changesSignals = [niches, skills, minFollowerRange].some((field) => field !== undefined);
    if (opportunity.status !== "draft" && changesSignals) {
      await scheduleScoring(ctx, opportunityId);
    }
    return opportunity;
  },
});

/** Returns a creator's paginated discovery feed of visible open opportunity briefs. */
export const discover = creatorQuery({
  args: opportunityDiscover.fields,
  returns: paginationResultValidator(starredCreatorOpportunity),
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    const result = await discoverOpportunities(ctx, args);
    return { ...result, page: await withStarredFlags(ctx, creatorId, result.page) };
  },
});

/**
 * Stars an opportunity for the calling creator. Starring again does nothing.
 *
 * @throws `not_found` if the opportunity doesn't exist or isn't visible to creators.
 */
export const star = creatorMutation({
  args: { opportunityId: v.id("opportunities") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await starOpportunity(ctx, ctx.user, args.opportunityId);
    return null;
  },
});

/** Removes the calling creator's star. Does nothing if the opportunity isn't starred. */
export const unstar = creatorMutation({
  args: { opportunityId: v.id("opportunities") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    await unstarOpportunity(ctx, creatorId, args.opportunityId);
    return null;
  },
});

/**
 * Lists the calling creator's starred opportunities, most recently starred
 * first. Ones creators can no longer see (paused, closed) are left out.
 */
export const listStarred = creatorQuery({
  args: starredOpportunityList.fields,
  returns: paginationResultValidator(starredCreatorOpportunity),
  handler: async (ctx, args) => {
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    return await listStarredOpportunities(ctx, creatorId, args);
  },
});

/** Returns the caller's company opportunities, optionally filtered by campaign and status. */
export const list = companyQuery({
  args: opportunityList.fields,
  returns: paginationResultValidator(opportunityView),
  handler: async (ctx, args) => {
    return await listOpportunities(ctx, ctx.membership.companyId, args);
  },
});

/**
 * Creates a draft or open opportunity in a campaign owned by the caller's company, with
 * its deliverables. An open one needs at least one (`invalid_state` `deliverables_required`).
 */
export const create = companyMutation({
  args: opportunityCreate.fields,
  returns: v.id("opportunities"),
  handler: async (ctx, args) => {
    const opportunityId = await createOpportunity(ctx, ctx.membership, args);
    // Scoring looks creators up by shared niches and skills; without any there is nothing to do.
    const hasSelections = (args.niches?.length ?? 0) + (args.skills?.length ?? 0) > 0;
    if (args.status === "open" && hasSelections) await scheduleScoring(ctx, opportunityId);
    return opportunityId;
  },
});

/** Returns a creator-facing brief or a complete opportunity with selections for its company/operators. */
export const get = authedQuery({
  args: { opportunityId: v.id("opportunities") },
  returns: v.union(opportunityView, starredCreatorOpportunity),
  handler: async (ctx, args) => {
    const opportunity = await getOpportunity(ctx, args.opportunityId, {
      user: ctx.user,
      orgId: findOrgId(ctx.identity),
    });
    // Company users and operators retain private fields; only creator briefs carry `companyName`.
    if (!("companyName" in opportunity)) return opportunity;
    // Creators also get whether they've starred it.
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    const isStarred = await isOpportunityStarred(ctx, creatorId, args.opportunityId);
    return { ...opportunity, isStarred };
  },
});
