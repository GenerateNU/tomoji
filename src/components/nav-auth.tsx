"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { signOutAction } from "@/app/auth/actions";

export function NavAuth() {
  const { user, loading, refreshAuth } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center gap-4">
        <div className="h-10 w-20 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">{user.email}</span>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex h-10 items-center justify-center rounded-full border border-solid border-black/[.08] px-4 text-sm font-medium transition-colors hover:border-transparent hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
          >
            Sign out
          </button>
        </form>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void refreshAuth({ ensureSignedIn: true })}
      className="flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
    >
      Sign in
    </button>
  );
}
