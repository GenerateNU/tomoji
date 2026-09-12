import { authkitProxy } from "@workos-inc/authkit-nextjs";

export default authkitProxy();

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
