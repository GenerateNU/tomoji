import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "./access";

/**
 * Our own Google flow, so the button skips the WorkOS-hosted page.
 *
 * It returns to the same /auth/callback as AuthKit, which is already a
 * registered redirect URI. That route sends a callback here only when its
 * `state` matches the attempt cookie /auth/google set; everything else is
 * AuthKit's.
 */
const COOKIE = "tomoji-google-oauth";
// Covers /auth/google, which sets it, and /auth/callback, which reads it.
const COOKIE_PATH = "/auth";

type GoogleAttempt = { state: string; codeVerifier: string; next: string };

/** Redirects to Google, remembering the attempt (and where to land after) for the callback. */
export async function startGoogleSignIn(request: NextRequest): Promise<Response> {
  const next = safeNext(request.nextUrl.searchParams.get("next"));
  const { url, state, codeVerifier } = await getWorkOS().userManagement.getAuthorizationUrlWithPKCE(
    {
      provider: "GoogleOAuth",
      clientId: process.env.WORKOS_CLIENT_ID!,
      redirectUri: process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI!,
    },
  );

  const response = NextResponse.redirect(url);
  response.headers.set("cache-control", "no-store");
  // The callback checks `state` against this cookie (CSRF) and needs the
  // verifier to exchange the code (PKCE).
  response.cookies.set(COOKIE, JSON.stringify({ state, codeVerifier, next }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: 10 * 60,
  });
  return response;
}

/** The Google attempt this callback belongs to, or null if it isn't one of ours. */
export function googleAttemptFor(request: NextRequest): GoogleAttempt | null {
  const attempt = parseAttempt(request.cookies.get(COOKIE)?.value);
  const state = request.nextUrl.searchParams.get("state");
  return attempt && state === attempt.state ? attempt : null;
}

/** Exchanges the code for a session, then goes where the user was headed, or back to log in on failure. */
export async function finishGoogleSignIn(
  request: NextRequest,
  attempt: GoogleAttempt,
): Promise<Response> {
  // Missing when the user cancels at Google (`error=access_denied`).
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return finish(request, "/login?error=google");

  try {
    const response = await getWorkOS().userManagement.authenticateWithCode({
      clientId: process.env.WORKOS_CLIENT_ID!,
      code,
      codeVerifier: attempt.codeVerifier,
    });
    await saveSession(response, request);
  } catch (error) {
    console.error("[auth] google failed", {
      name: error instanceof Error ? error.name : typeof error,
      requestID: error instanceof Error && "requestID" in error ? error.requestID : undefined,
    });
    return finish(request, "/login?error=google");
  }
  return finish(request, safeNext(attempt.next));
}

/** Redirects within the app and always drops the one-time attempt cookie. */
function finish(request: NextRequest, path: string): Response {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  response.cookies.set(COOKIE, "", { path: COOKIE_PATH, maxAge: 0 });
  return response;
}

function parseAttempt(raw: string | undefined): GoogleAttempt | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "state" in parsed &&
      "codeVerifier" in parsed &&
      typeof parsed.state === "string" &&
      typeof parsed.codeVerifier === "string"
    ) {
      // Older cookies have no `next`; the cookie is client-held, so re-validate it.
      const next =
        "next" in parsed && typeof parsed.next === "string" ? safeNext(parsed.next) : "/";
      return { state: parsed.state, codeVerifier: parsed.codeVerifier, next };
    }
  } catch {
    // A tampered or stale cookie is treated as missing.
  }
  return null;
}
