"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import Link from "next/link";
import { signOutAction } from "@/app/auth/actions";
import { InvitesLink } from "@/features/invites/components/invites-link";

/** Shows account actions, the inbox, and company-admin invitation navigation. */
export function NavAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center gap-4">
        <div className="h-10 w-20 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-4">
        <Link
          href="/notifications"
          className="inline-flex min-h-11 items-center rounded-md text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          Notifications
        </Link>
        <InvitesLink />
        <span className="hidden text-sm text-zinc-600 sm:inline dark:text-zinc-400">
          {user.email}
        </span>
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
    <Link
      href="/login"
      className="flex h-10 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
    >
      Sign in
    </Link>
  );
}
