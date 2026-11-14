"use client";

import { Fragment, type ReactNode } from "react";
import { SignedOutNotice } from "@/features/auth/components/signed-out-notice";
import { Skeleton } from "@/components/ui/skeleton";
import { useMe } from "../hooks/use-me";

type RequireAccountProps = {
  /** The account type this page is for. */
  role: "creator" | "company" | "operator";
  /** Company pages that only admins may open. */
  companyRole?: "admin";
  /** Where to return after signing in. */
  next: string;
  /** What to say to someone whose account is the wrong type for this page. */
  wrongRole: string;
  /** Shown while the account is being decided. A plain bar unless given. */
  fallback?: ReactNode;
  /** What a screen reader hears while loading. Pages name their own content. */
  loading?: string;
  /** What to say once signed in but before the account exists yet. */
  unsynced?: string;
  children: ReactNode;
};

/**
 * The four states every signed-in page shares, in one place: deciding,
 * signed out, synced but not yet provisioned, and the wrong account type.
 *
 * Each page used to spell these out itself, which drifted the wording and,
 * more importantly, let most of them skip the signed-out case entirely. A
 * skipped `users.me` stays `undefined`, so those pages showed a loading state
 * forever instead of offering a way to sign in.
 */
export function RequireAccount({
  role,
  companyRole,
  next,
  wrongRole,
  fallback,
  loading = "Loading…",
  unsynced = "We're finishing setting up your account. This usually takes a few seconds.",
  children,
}: RequireAccountProps) {
  const me = useMe();

  if (me === undefined) {
    return (
      fallback ?? (
        <div className="p-10">
          <Skeleton className="h-10 w-56" />
          <span className="sr-only" role="status">
            {loading}
          </span>
        </div>
      )
    );
  }
  if (me === null) return <SignedOutNotice next={next} />;
  if (!me.synced) {
    return (
      <p role="status" className="p-10 text-sm text-muted-foreground">
        {unsynced}
      </p>
    );
  }
  // Compared against the literal rather than `role`, so the union narrows and
  // `companyRole` is only read on the branch that has it.
  const wrongAccount =
    me.role !== role ||
    (companyRole !== undefined && (me.role !== "company" || me.companyRole !== companyRole));
  if (wrongAccount) {
    return (
      <p role="alert" className="p-10 text-sm text-muted-foreground">
        {wrongRole}
      </p>
    );
  }
  // Keyed on the account, so switching users remounts the page rather than
  // leaving one person's drafts and scroll position in front of the next.
  return <Fragment key={me.userId}>{children}</Fragment>;
}
