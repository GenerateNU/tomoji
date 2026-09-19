import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { companyQuery, creatorQuery } from "./lib/functions";
import {
  creatorProfile,
  listCreators,
  requireCreatorProfile,
  requireCreatorProfileById,
} from "./models/creators";

/** Returns all user-facing fields in the authenticated creator's profile. */
export const me = creatorQuery({
  args: {},
  returns: creatorProfile,
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

/** Returns a specific active creator profile to a company. */
export const get = companyQuery({
  args: { creatorId: v.id("creators") },
  returns: creatorProfile,
  handler: async (ctx, args) => {
    return await requireCreatorProfileById(ctx, args.creatorId);
  },
});
