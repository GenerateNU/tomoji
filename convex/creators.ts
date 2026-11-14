import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { companyQuery, creatorMutation, creatorQuery } from "./lib/functions";
import {
  completeCreatorOnboarding,
  creatorProfile,
  creatorProfileUpdate,
  ownCreatorProfile,
  listCreators,
  requireCreatorProfile,
  requireCreatorProfileById,
  updateCreatorProfile,
} from "./models/creators";

/** Returns all user-facing fields in the authenticated creator's profile. */
export const me = creatorQuery({
  args: {},
  returns: ownCreatorProfile,
  handler: async (ctx) => {
    return await requireCreatorProfile(ctx, ctx.user);
  },
});

/** Lists active creator profiles for companies with cursor pagination. */
export const list = companyQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(creatorProfile),
  handler: async (ctx, args) => {
    return await listCreators(ctx, args);
  },
});

/**
 * Returns a specific active creator profile to a company. Private creators are
 * reachable only by a company they have applied to or been assigned by.
 *
 * @throws `not_found` if the creator does not exist or is private to this company.
 */
export const get = companyQuery({
  args: { creatorId: v.id("creators") },
  returns: creatorProfile,
  handler: async (ctx, args) => {
    return await requireCreatorProfileById(ctx, args.creatorId, ctx.membership.companyId);
  },
});

/** Updates the authenticated creator's editable profile fields. */
export const update = creatorMutation({
  args: creatorProfileUpdate.fields,
  returns: ownCreatorProfile,
  handler: async (ctx, args) => {
    const profile = await updateCreatorProfile(ctx, ctx.user, args);
    const { niches, skills, followerRange } = args;
    if ([niches, skills, followerRange].some((field) => field !== undefined)) {
      await ctx.scheduler.runAfter(0, internal.opportunityScores.scoreCreator, {
        creatorId: profile.creatorId,
      });
    }
    return profile;
  },
});

/**
 * Marks the creator's onboarding finished once their profile carries what the
 * flow collects. Until it is set, sign-in routes them back into onboarding.
 *
 * @throws `invalid_state` with reason `onboarding_incomplete` and the missing
 * field names when something is still unset.
 */
export const completeOnboarding = creatorMutation({
  args: {},
  returns: ownCreatorProfile,
  handler: async (ctx) => await completeCreatorOnboarding(ctx, ctx.user),
});
