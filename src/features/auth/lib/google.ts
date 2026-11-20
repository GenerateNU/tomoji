import type { NextRequest } from "next/server";
import { safeNext } from "./access";
import { attemptFor, finishPkceSignIn, startPkceSignIn, type PkceAttempt } from "./pkce-attempt";

/**
 * Our own Google flow, so the button skips the WorkOS-hosted page.
 *
 * It returns to the same /auth/callback as AuthKit, which is already a
 * registered redirect URI. That route sends a callback here only when its
 * `state` matches the attempt cookie /auth/google set; everything else is
 * AuthKit's.
 */
const COOKIE = "tomoji-google-oauth";

/** Redirects to Google, remembering the attempt (and where to land after) for the callback. */
export async function startGoogleSignIn(request: NextRequest): Promise<Response> {
  return await startPkceSignIn(COOKIE, safeNext(request.nextUrl.searchParams.get("next")), {
    provider: "GoogleOAuth",
  });
}

/** The Google attempt this callback belongs to, or null if it isn't one of ours. */
export function googleAttemptFor(request: NextRequest): PkceAttempt | null {
  return attemptFor(request, COOKIE);
}

/** Exchanges the code for a session, then goes where the user was headed, or back to log in on failure. */
export async function finishGoogleSignIn(
  request: NextRequest,
  attempt: PkceAttempt,
): Promise<Response> {
  return await finishPkceSignIn(request, attempt, COOKIE, "/login?error=google", "google");
}
