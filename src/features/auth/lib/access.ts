/** Pages only signed-out visitors need; signed-in users are sent on to where they were headed. */
const SIGNED_OUT_ONLY = ["/login", "/signup"];

const AUTH_PAGES = [...SIGNED_OUT_ONLY, "/forgot-password", "/reset-password", "/verify-email"];

// Everything else, including the home page at "/", is signed-in only.
const PUBLIC = [
  ...AUTH_PAGES,
  // Signed-out X callbacks are handled there, without forwarding provider codes to sign-in.
  "/api/x/callback",
];

const PUBLIC_PREFIXES = ["/auth/"];

const MAX_NEXT_LENGTH = 2048;

function isAuthPage(pathname: string): boolean {
  return (
    AUTH_PAGES.includes(pathname) ||
    pathname === "/auth" ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

function isPublic(pathname: string): boolean {
  return PUBLIC.includes(pathname) || PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export type ProxyRequest = { method: string; pathname: string; search: string };

/** Where the proxy should send this request, or null to let it through. */
export function redirectFor(request: ProxyRequest, signedIn: boolean): string | null {
  // Server actions POST to the page they're on, including AuthKit's getAuth()
  // right after sign-in on /login. Redirecting it breaks the session handoff,
  // so actions and route handlers must check auth themselves (see the Next proxy docs).
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return null;

  const { pathname, search } = request;
  if (signedIn) {
    if (!SIGNED_OUT_ONLY.includes(pathname)) return null;
    return safeNext(new URLSearchParams(search).get("next"));
  }
  return isPublic(pathname) ? null : withNext("/login", safeNext(pathname + search));
}

/** `value` if it's a same-site, non-auth path to return to after signing in; otherwise "/". */
export function safeNext(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_NEXT_LENGTH) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  // Browsers treat `\` as `/` and strip tabs and newlines, so `/\evil.com` would leave the site.
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return "/";

  let url: URL;
  try {
    url = new URL(value, "http://tomoji.invalid");
  } catch {
    return "/";
  }
  if (url.origin !== "http://tomoji.invalid") return "/";
  // Checked on the normalized path, so `/x/../login` is caught.
  if (isAuthPage(url.pathname)) return "/";
  return url.pathname + url.search;
}

/** `path` with `?next=` appended, omitted when next is "/". */
export function withNext(path: string, next: string): string {
  return next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`;
}
