import { authkit, handleAuthkitProxy } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/"];
const PUBLIC_PREFIXES = ["/auth"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default async function proxy(request: NextRequest) {
  const { session, headers, authorizationUrl } = await authkit(request);
  const { pathname } = request.nextUrl;

  if (!isPublic(pathname) && !session.user && authorizationUrl) {
    return handleAuthkitProxy(request, headers, { redirect: authorizationUrl });
  }

  return handleAuthkitProxy(request, headers);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
