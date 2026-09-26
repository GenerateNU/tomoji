import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { requireNonBlank } from "../lib/validation";

export type UserFields = Pick<
  Doc<"users">,
  "workosId" | "email" | "role" | "isActive" | "profilePicture"
> & { firstName: string; lastName: string };

export type LegacyUserFields = Omit<UserFields, "firstName" | "lastName"> & {
  name?: string;
  firstName?: string;
  lastName?: string;
};

export type CachedNameParts = {
  firstName?: string | null;
  lastName?: string | null;
};

/** Builds a replacement without legacy or system fields; the caller keeps the row's ID. */
export function normalizeLegacyUser(
  user: LegacyUserFields,
  source?: CachedNameParts | null,
): UserFields {
  const firstName = user.firstName ?? source?.firstName;
  const lastName = user.lastName ?? source?.lastName;
  const hasNameParts = typeof firstName === "string" || typeof lastName === "string";
  // Legacy names cannot be reliably split. Keep them intact unless authoritative
  // parts exist. If no usable name remains, use the account email below.
  const legacyName = user.name === user.email ? "" : (user.name ?? "");
  const selectedFirstName = firstName ?? (hasNameParts ? "" : legacyName);

  return {
    workosId: user.workosId,
    firstName: requireNonBlank(selectedFirstName.trim() || user.email, "firstName"),
    lastName: lastName ?? "",
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    ...(user.profilePicture === undefined ? {} : { profilePicture: user.profilePicture }),
  };
}

/** Run under a compatible legacy schema before deploying required name fields. */
export async function migrateUserNames(
  ctx: MutationCtx,
  user: LegacyUserFields & { _id: Id<"users"> },
): Promise<void> {
  if (
    user.name === undefined &&
    user.firstName !== undefined &&
    user.firstName.trim().length > 0 &&
    user.lastName !== undefined
  ) {
    return;
  }
  const source: CachedNameParts | null =
    user.firstName === undefined || user.lastName === undefined
      ? await ctx.runQuery(components.workOSAuthKit.lib.getAuthUser, { id: user.workosId })
      : null;
  // replace removes the obsolete `name` field while retaining _id and _creationTime.
  await ctx.db.replace("users", user._id, normalizeLegacyUser(user, source));
}

/** Fills missing usernames before the field becomes required, preserving existing choices. */
export async function migrateCreatorUsername(
  ctx: MutationCtx,
  creator: Doc<"creators">,
): Promise<void> {
  if (creator.username !== undefined) return;
  await ctx.db.patch("creators", creator._id, { username: `creator_${creator.userId}` });
}
