import { creatorQuery } from "./lib/functions";
import { creatorProfile, requireCreatorProfile } from "./models/creators";

/** Returns all user-facing fields in the authenticated creator's profile. */
export const me = creatorQuery({
  args: {},
  returns: creatorProfile,
  handler: async (ctx) => {
    return await requireCreatorProfile(ctx, ctx.user);
  },
});
