import { AuthKit, type AuthFunctions } from "@convex-dev/workos-authkit";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { toCompanyRole } from "./lib/identity";
import { deactivateUser, removeMembership, syncMembership, upsertUser } from "./models/users";

const authFunctions: AuthFunctions = internal.auth;

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
  authFunctions,
  additionalEventTypes: [
    "organization_membership.created",
    "organization_membership.updated",
    "organization_membership.deleted",
  ],
});

type WorkosName = { name: string | null; firstName: string | null; lastName: string | null };

function displayName(user: WorkosName) {
  if (user.name) return user.name;
  const parts = [user.firstName, user.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

type WorkosMembership = {
  userId: string;
  organizationId: string;
  organizationName: string;
  role: { slug: string };
  status: string;
};

function membershipFrom(data: WorkosMembership) {
  return {
    workosUserId: data.userId,
    organizationId: data.organizationId,
    organizationName: data.organizationName,
    role: toCompanyRole(data.role.slug),
    status: data.status,
  };
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
    await syncMembership(ctx, membershipFrom(event.data));
  },
  "organization_membership.updated": async (ctx, event) => {
    await syncMembership(ctx, membershipFrom(event.data));
  },
  "organization_membership.deleted": async (ctx, event) => {
    await removeMembership(ctx, {
      workosUserId: event.data.userId,
      organizationId: event.data.organizationId,
    });
  },
});

export const { backfillUsers } = authKit.utils();
