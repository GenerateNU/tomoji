import type { NextRequest } from "next/server";
import { safeNext } from "./access";
import { invitationTokenFrom } from "./invitation-token";
import {
  attemptFor,
  finish,
  finishPkceSignIn,
  startPkceSignIn,
  type PkceAttempt,
} from "./pkce-attempt";

/**
 * Accepting a WorkOS invitation.
 *
 * The invitation email's button lands on /auth/invite carrying a one-time
 * token. Handing that token to WorkOS opens the hosted page where the invitee
 * sets a password, which is the step the app has no screen for; accepting there
 * activates their organization membership, and the resulting
 * `organization_membership.created` webhook is what gives them their role.
 *
 * Without this route the token is dropped on the log in page and the invitee is
 * stuck: the account exists but has no password to sign in with.
 */
const COOKIE = "tomoji-invite";

/** Sends the invitee to WorkOS to accept and set a password. */
export async function startInviteAcceptance(request: NextRequest): Promise<Response> {
  const token = invitationTokenFrom(request.nextUrl.searchParams);
  // A bare /auth/invite is someone following a stale or hand-edited link.
  if (token === null) return finish(request, COOKIE, "/login?error=invite");

  return await startPkceSignIn(COOKIE, safeNext(request.nextUrl.searchParams.get("next")), {
    invitationToken: token,
    // The invitee has no password yet, so open the screen that sets one.
    screenHint: "sign-up",
  });
}

/** The invitation attempt this callback belongs to, or null if it isn't one of ours. */
export function inviteAttemptFor(request: NextRequest): PkceAttempt | null {
  return attemptFor(request, COOKIE);
}

/** Exchanges the code for a session, landing the new account in the app. */
export async function finishInviteAcceptance(
  request: NextRequest,
  attempt: PkceAttempt,
): Promise<Response> {
  return await finishPkceSignIn(request, attempt, COOKIE, "/login?error=invite", "invite");
}
