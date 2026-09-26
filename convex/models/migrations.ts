import { components } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

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
  // parts exist. A legacy email-as-name becomes empty name parts.
  const legacyName = user.name === user.email ? "" : (user.name ?? "");

  return {
    workosId: user.workosId,
    firstName: firstName ?? (hasNameParts ? "" : legacyName),
    lastName: lastName ?? "",
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    ...(user.profilePicture === undefined ? {} : { profilePicture: user.profilePicture }),
  };
}

/** Run under the transitional schema, before requiring the new name fields. */
export async function migrateUserNames(
  ctx: MutationCtx,
  user: LegacyUserFields & { _id: Id<"users"> },
): Promise<void> {
  if (user.name === undefined && user.firstName !== undefined && user.lastName !== undefined) {
    return;
  }
  const source: CachedNameParts | null =
    user.firstName === undefined || user.lastName === undefined
      ? await ctx.runQuery(components.workOSAuthKit.lib.getAuthUser, { id: user.workosId })
      : null;
  // replace removes the obsolete `name` field while retaining _id and _creationTime.
  await ctx.db.replace("users", user._id, normalizeLegacyUser(user, source));
}
