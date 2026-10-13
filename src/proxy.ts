import { authkitProxy } from "@workos-inc/authkit-nextjs";

export default authkitProxy({
  middlewareAuth: {
    enabled: true,
    // Handle signed-out X callbacks here without forwarding provider codes to sign-in.
    unauthenticatedPaths: ["/", "/auth/:path*", "/api/x/callback"],
  },
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
