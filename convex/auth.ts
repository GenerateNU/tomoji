import { AuthKit, type AuthFunctions } from "@convex-dev/workos-authkit";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { toCompanyRole } from "./lib/identity";
import {
  closeInvite,
  invitationFrom,
  recordInvite,
  refreshInvite,
  type WorkosInvitation,
} from "./models/invites";
import {
  deactivateUser,
  isOperatorOrg,
  removeMembership,
  syncMembership,
  upsertUser,
} from "./models/users";

const authFunctions: AuthFunctions = internal.auth;

export const authKit = new AuthKit<DataModel>(components.workOSAuthKit, {
  authFunctions,
  additionalEventTypes: [
    "organization_membership.created",
    "organization_membership.updated",
    "organization_membership.deleted",
    "invitation.created",
    "invitation.accepted",
    "invitation.revoked",
    "invitation.resent",
  ],
});

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
      firstName: event.data.firstName,
      lastName: event.data.lastName,
    });
  },
  "user.updated": async (ctx, event) => {
    await upsertUser(ctx, {
      workosId: event.data.id,
      email: event.data.email,
      firstName: event.data.firstName,
      lastName: event.data.lastName,
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
  "invitation.created": async (ctx, event) => {
    const invitation = invitationFrom(event.data as WorkosInvitation);
    await recordInvite(
      ctx,
      invitation,
      invitation.organizationId !== undefined && isOperatorOrg(invitation.organizationId),
    );
  },
  // Accepting also fires user.created and organization_membership.created,
  // which do the real work; this only clears the pending row.
  "invitation.accepted": async (ctx, event) => {
    await closeInvite(ctx, (event.data as WorkosInvitation).id);
  },
  "invitation.revoked": async (ctx, event) => {
    await closeInvite(ctx, (event.data as WorkosInvitation).id);
  },
  "invitation.resent": async (ctx, event) => {
    await refreshInvite(ctx, invitationFrom(event.data as WorkosInvitation));
  },
  "organization_membership.deleted": async (ctx, event) => {
    await removeMembership(ctx, {
      workosUserId: event.data.userId,
      organizationId: event.data.organizationId,
    });
  },
});

export const { backfillUsers } = authKit.utils();
