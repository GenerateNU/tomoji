"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import Link from "next/link";
import { signOutAction } from "@/app/auth/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamLink } from "@/features/team/components/team-link";

/** Shows account actions, the inbox, and company-admin invitation navigation. */
export function NavAuth() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-20 rounded-full" />
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
        <TeamLink />
        <span className="hidden text-sm text-zinc-600 sm:inline dark:text-zinc-400">
          {user.email}
        </span>
        <form action={signOutAction}>
          <Button type="submit" variant="secondary" className="h-10 rounded-full px-4">
            Sign out
          </Button>
        </form>
      </div>
    );
  }

  return (
    <Link href="/login" className={cn(buttonVariants(), "h-10 rounded-full px-5")}>
      Sign in
    </Link>
  );
}
