"use node";

import { WorkOS } from "@workos-inc/node";
import { env } from "../_generated/server";
import { apiError } from "./errors";

/**
 * How long an invitation stays valid. Not configurable per call: nobody
 * sending one should have to think about it.
 */
export const INVITE_EXPIRES_IN_DAYS = 7;

/**
 * The WorkOS client, for actions only. `"use node"` keeps it out of queries
 * and mutations, which cannot make network calls.
 *
 * @throws `misconfigured` if the deployment has no API key.
 */
export function workosClient(): WorkOS {
  const apiKey = env.WORKOS_API_KEY;
  if (!apiKey) throw apiError("misconfigured", { reason: "workos_api_key_missing" });
  return new WorkOS(apiKey);
}

/**
 * Why WorkOS refused to invite an address. `email_already_invited` means an
 * invitation is still pending; `user_already_exists` means they already have an
 * account, which happens once someone has accepted an earlier invite.
 */
const DUPLICATE_REASONS: Record<string, string | undefined> = {
  email_already_invited: "invite_already_pending",
  user_already_exists: "already_registered",
};

export type SendInvite = {
  email: string;
  organizationId?: string;
  roleSlug?: string;
};

/**
 * Sends one invitation. The `invitation.created` webhook records it, so this
 * deliberately writes nothing itself.
 *
 * @throws `conflict` if WorkOS already has a pending invitation for the email.
 * @throws `upstream_failure` if WorkOS rejects the request for any other reason.
 */
export async function sendInvite(invite: SendInvite): Promise<void> {
  // Built outside the try so a misconfigured deployment is not reported as a
  // WorkOS outage.
  const client = workosClient();
  try {
    await client.userManagement.sendInvitation({
      email: invite.email,
      organizationId: invite.organizationId,
      roleSlug: invite.roleSlug,
      expiresInDays: INVITE_EXPIRES_IN_DAYS,
    });
  } catch (error) {
    // WorkOS reports both of these as a 400 carrying a code, not as a 409.
    const reason = DUPLICATE_REASONS[(error as { code?: string } | null)?.code ?? ""];
    if (reason !== undefined) throw apiError("conflict", { reason });
    throw apiError("upstream_failure", { reason: "workos_invite_failed" });
  }
}

/** Creates the WorkOS organization a new company signs in through. */
export async function createWorkosOrganization(name: string): Promise<string> {
  const client = workosClient();
  try {
    const organization = await client.organizations.createOrganization({ name });
    return organization.id;
  } catch {
    throw apiError("upstream_failure", { reason: "workos_organization_failed" });
  }
}

/** Cancels a pending invitation. The `invitation.revoked` webhook clears the row. */
export async function revokeInvite(workosInvitationId: string): Promise<void> {
  const client = workosClient();
  try {
    await client.userManagement.revokeInvitation(workosInvitationId);
  } catch {
    throw apiError("upstream_failure", { reason: "workos_revoke_failed" });
  }
}
