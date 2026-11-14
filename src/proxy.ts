import type { NextRequest } from "next/server";
import { authkit, handleAuthkitProxy } from "@workos-inc/authkit-nextjs";
import { redirectFor } from "@/features/auth/lib/access";

// Composed by hand rather than `authkitProxy` so signed-out visitors land on
// our /login page instead of the WorkOS-hosted one.
export default async function proxy(request: NextRequest) {
  const { session, headers } = await authkit(request);
  const { method, nextUrl } = request;
  const redirect = redirectFor(
    { method, pathname: nextUrl.pathname, search: nextUrl.search },
    Boolean(session.user),
  );
  return handleAuthkitProxy(request, headers, redirect ? { redirect } : undefined);
}

export const config = {
  // Skips Next.js assets and files from public/ (any path with a dot), which
  // must load for signed-out visitors too.
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
