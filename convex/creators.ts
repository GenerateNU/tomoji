import { creatorQuery } from "./lib/functions";
import { requireCreatorProfile } from "./models/creators";
import { creatorProfile } from "./schemas/creators.schema";

/** Returns all user-facing fields in the authenticated creator's profile. */
export const me = creatorQuery({
  args: {},
  returns: creatorProfile,
  handler: async (ctx) => {
    return await requireCreatorProfile(ctx, ctx.user);
  },
});
