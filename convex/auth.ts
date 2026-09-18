import { AuthKit, type AuthFunctions } from "@convex-dev/workos-authkit";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { toCompanyRole } from "./lib/identity";
import { applyMembership, deactivateUser, removeMembership, upsertUser } from "./models/users";

const authFunctions: AuthFunctions = internal.auth;

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, { authFunctions });

type WorkosName = { name: string | null; firstName: string | null; lastName: string | null };

function displayName(user: WorkosName) {
  if (user.name) return user.name;
  const parts = [user.firstName, user.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

export const { authKitEvent } = authKit.events({
  "user.created": async (ctx, event) => {
    await upsertUser(ctx, {
      workosId: event.data.id,
      email: event.data.email,
      name: displayName(event.data),
      profilePicture: event.data.profilePictureUrl ?? undefined,
    });
  },
  "user.updated": async (ctx, event) => {
    await upsertUser(ctx, {
      workosId: event.data.id,
      email: event.data.email,
      name: displayName(event.data),
      profilePicture: event.data.profilePictureUrl ?? undefined,
    });
  },
  "user.deleted": async (ctx, event) => {
    await deactivateUser(ctx, event.data.id);
  },
  "organization_membership.created": async (ctx, event) => {
    await applyMembership(ctx, {
      workosUserId: event.data.userId,
      organizationId: event.data.organizationId,
      organizationName: event.data.organizationName,
      role: toCompanyRole(event.data.role.slug),
    });
  },
  "organization_membership.updated": async (ctx, event) => {
    await applyMembership(ctx, {
      workosUserId: event.data.userId,
      organizationId: event.data.organizationId,
      organizationName: event.data.organizationName,
      role: toCompanyRole(event.data.role.slug),
    });
  },
  "organization_membership.deleted": async (ctx, event) => {
    await removeMembership(ctx, {
      workosUserId: event.data.userId,
      organizationId: event.data.organizationId,
    });
  },
});

export const { backfillUsers } = authKit.utils();
