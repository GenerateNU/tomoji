import { getWorkOS, saveSession } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "./access";

/**
 * A sign-in this app started itself rather than handing to AuthKit, remembered
 * across the trip to WorkOS.
 *
 * Both of ours — the Google button and an accepted invitation — come back to
 * the same registered redirect URI as AuthKit, so the callback tells them apart
 * by matching `state` against the cookie the starting route set. `handleAuth`
 * gets everything that matches neither.
 */
export type PkceAttempt = { state: string; codeVerifier: string; next: string };

/** Covers the route that sets the cookie and the callback that reads it. */
const COOKIE_PATH = "/auth";
const COOKIE_MAX_AGE = 10 * 60;

/** What the caller varies: the provider, or the invitation being accepted. */
export type AuthorizeIntent = {
  provider?: string;
  invitationToken?: string;
  screenHint?: "sign-up" | "sign-in";
};

/** Sends the browser to WorkOS, remembering the attempt (and where to land after). */
export async function startPkceSignIn(
  cookie: string,
  next: string,
  intent: AuthorizeIntent,
): Promise<Response> {
  const { url, state, codeVerifier } = await getWorkOS().userManagement.getAuthorizationUrlWithPKCE(
    {
      ...intent,
      clientId: process.env.WORKOS_CLIENT_ID!,
      redirectUri: process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI!,
    },
  );

  const response = NextResponse.redirect(url);
  response.headers.set("cache-control", "no-store");
  // The callback checks `state` against this cookie (CSRF) and needs the
  // verifier to exchange the code (PKCE).
  response.cookies.set(cookie, JSON.stringify({ state, codeVerifier, next: safeNext(next) }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}

/** The attempt this callback belongs to, or null when it isn't one of ours. */
export function attemptFor(request: NextRequest, cookie: string): PkceAttempt | null {
  const attempt = parseAttempt(request.cookies.get(cookie)?.value);
  const state = request.nextUrl.searchParams.get("state");
  return attempt && state === attempt.state ? attempt : null;
}

/**
 * Exchanges the code for a session, then goes where the user was headed, or
 * back to log in on failure.
 */
export async function finishPkceSignIn(
  request: NextRequest,
  attempt: PkceAttempt,
  cookie: string,
  failurePath: string,
  label: string,
): Promise<Response> {
  // Missing when the user cancels at the provider (`error=access_denied`).
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return finish(request, cookie, failurePath);

  try {
    const response = await getWorkOS().userManagement.authenticateWithCode({
      clientId: process.env.WORKOS_CLIENT_ID!,
      code,
      codeVerifier: attempt.codeVerifier,
    });
    await saveSession(response, request);
  } catch (error) {
    // Deliberately not the message: AuthKit puts request details on the error.
    console.error(`[auth] ${label} failed`, {
      name: error instanceof Error ? error.name : typeof error,
      requestID: error instanceof Error && "requestID" in error ? error.requestID : undefined,
    });
    return finish(request, cookie, failurePath);
  }
  return finish(request, cookie, safeNext(attempt.next));
}

/** Redirects within the app and always drops the one-time attempt cookie. */
export function finish(request: NextRequest, cookie: string, path: string): Response {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  response.cookies.set(cookie, "", { path: COOKIE_PATH, maxAge: 0 });
  return response;
}

function parseAttempt(raw: string | undefined): PkceAttempt | null {
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
