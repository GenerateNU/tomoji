import { NextResponse, type NextRequest } from "next/server";

/**
 * Why a sign-in sent the user back to the log in page. The reason itself never
 * goes in the URL, only this key.
 */
const NOTICES: Record<string, string | undefined> = {
  google: "Google sign-in didn't finish. Try again.",
};

/** The notice to show for `/login?error=…`, or null when there is nothing to say. */
export function signInNotice(error: string | string[] | undefined): string | null {
  return (typeof error === "string" ? NOTICES[error] : undefined) ?? null;
}

/**
 * Where a failed AuthKit callback lands.
 *
 * AuthKit's default is a raw JSON body, which is a dead end. This sends people
 * to the ordinary log in page instead, with no notice: the usual way to get
 * here is accepting an invitation, which never sets the PKCE cookie
 * `handleAuth` requires, and in that case the account was created fine. Saying
 * anything went wrong would be inaccurate, so the form speaks for itself.
 */
export async function authKitFailure({
  error,
  request,
}: {
  error?: unknown;
  request: NextRequest;
}): Promise<Response> {
  // Deliberately not the message or context: `code` is a live credential and
  // AuthKit puts request details on the error.
  console.error("[auth] authkit callback failed", {
    name: error instanceof Error ? error.name : typeof error,
    code: error instanceof Error && "code" in error ? error.code : undefined,
  });

  const response = NextResponse.redirect(new URL("/login", request.url));
  response.headers.set("cache-control", "no-store");
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}
