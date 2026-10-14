/** Pages only signed-out visitors need; signed-in users are sent home. */
const SIGNED_OUT_ONLY = ["/login", "/signup"];

const PUBLIC = [
  "/",
  ...SIGNED_OUT_ONLY,
  "/forgot-password",
  "/reset-password",
  "/verify-email",
  // Signed-out X callbacks are handled there, without forwarding provider codes to sign-in.
  "/api/x/callback",
];

const PUBLIC_PREFIXES = ["/auth/"];

function isPublic(pathname: string): boolean {
  return PUBLIC.includes(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Where the proxy should send this request, or null to let it through. */
export function redirectFor(pathname: string, signedIn: boolean): string | null {
  if (signedIn) return SIGNED_OUT_ONLY.includes(pathname) ? "/" : null;
  return isPublic(pathname) ? null : "/login";
}
