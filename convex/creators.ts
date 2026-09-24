import { creatorQuery } from "./lib/functions";
import { apiError } from "./lib/errors";
import { creatorProfile, getCreatorByUserId } from "./models/creators";

/** Returns all user-facing fields in the authenticated creator's profile. */
export const me = creatorQuery({
  args: {},
  returns: creatorProfile,
  handler: async (ctx) => {
    const creator = await getCreatorByUserId(ctx, ctx.user._id);
    if (creator === null) {
      throw apiError("not_found", { resource: "creator" });
    }

    return {
      creatorId: creator._id,
      name: ctx.user.name,
      email: ctx.user.email,
      profilePicture: ctx.user.profilePicture,
      xId: creator.xId,
      githubLink: creator.githubLink,
      phoneNumber: creator.phoneNumber,
    };
  },
});
