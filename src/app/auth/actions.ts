"use server";

import { signOut } from "@workos-inc/authkit-nextjs";

export async function signOutAction() {
  const returnTo = new URL(process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI!).origin;
  await signOut({ returnTo });
}
