import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
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
  createOpportunity,
  discoverOpportunities,
  getOpportunity,
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
import { requireCallerCreatorId } from "./models/users";
import schema from "./schema";

/** Closes an owned published opportunity permanently without cancelling existing assignments. */
export const close = companyMutation({
  args: { opportunityId: v.id("opportunities") },
  returns: schema.doc("opportunities"),
  handler: async (ctx, { opportunityId }) => {
    return await closeOpportunity(ctx, ctx.membership, opportunityId);
  },
});

/** Drains overdue opportunities in bounded transactions for the deadline cron. */
export const closeExpired = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const hasMore = await closeExpiredOpportunities(ctx);
    if (hasMore) await ctx.scheduler.runAfter(0, internal.opportunities.closeExpired, {});
    return null;
  },
});

/** Pauses an open opportunity owned by the caller's company, preserving existing workflow records. */
export const pause = companyMutation({
  args: { opportunityId: v.id("opportunities") },
  returns: schema.doc("opportunities"),
  handler: async (ctx, { opportunityId }) => {
    return await pauseOpportunity(ctx, ctx.membership, opportunityId);
  },
});

/** Resumes a paused opportunity in an open campaign before its deadline. */
export const resume = companyMutation({
  args: { opportunityId: v.id("opportunities") },
  returns: schema.doc("opportunities"),
  handler: async (ctx, { opportunityId }) => {
    return await resumeOpportunity(ctx, ctx.membership, opportunityId);
  },
});

/** Publishes a valid draft in an open campaign owned by the caller's company. */
export const publish = companyMutation({
  args: { opportunityId: v.id("opportunities") },
  returns: schema.doc("opportunities"),
  handler: async (ctx, { opportunityId }) => {
    return await publishOpportunity(ctx, ctx.membership, opportunityId);
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
  returns: schema.doc("opportunities"),
  handler: async (ctx, { opportunityId, ...updates }) => {
    return await updateOpportunity(ctx, ctx.membership, opportunityId, updates);
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
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    await starOpportunity(ctx, creatorId, args.opportunityId);
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
  returns: paginationResultValidator(schema.doc("opportunities")),
  handler: async (ctx, args) => {
    return await listOpportunities(ctx, ctx.membership.companyId, args);
  },
});

/** Creates a draft or open opportunity in a campaign owned by the caller's company. */
export const create = companyMutation({
  args: opportunityCreate.fields,
  returns: v.id("opportunities"),
  handler: async (ctx, args) => {
    return await createOpportunity(ctx, ctx.membership, args);
  },
});

/** Returns a public brief to creators or the complete document to its company and operators. */
export const get = authedQuery({
  args: { opportunityId: v.id("opportunities") },
  returns: v.union(schema.doc("opportunities"), starredCreatorOpportunity),
  handler: async (ctx, args) => {
    const opportunity = await getOpportunity(ctx, args.opportunityId, {
      user: ctx.user,
      orgId: findOrgId(ctx.identity),
    });
    // Company users and operators get the full document; only creator briefs carry `companyName`.
    if (!("companyName" in opportunity)) return opportunity;
    // Creators also get whether they've starred it.
    const creatorId = await requireCallerCreatorId(ctx, ctx.user);
    const isStarred = await isOpportunityStarred(ctx, creatorId, args.opportunityId);
    return { ...opportunity, isStarred };
  },
});
