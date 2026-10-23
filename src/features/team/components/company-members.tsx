"use client";

import Image from "next/image";
import { notFound } from "next/navigation";
import { usePaginatedQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { memberName } from "@/features/team/lib/member-name";
import { useMe } from "@/features/users/hooks/use-me";
import { SignedOutNotice } from "@/features/auth/components/signed-out-notice";
import { CompanyInvites } from "@/features/invites/components/company-invites";

/** Displays the caller's company directory without changing memberships. */
export function CompanyMembers() {
  const me = useMe();
  const allowed = me?.synced && me.role === "company";
  const { results, status, loadMore } = usePaginatedQuery(
    api.companyUsers.list,
    allowed ? {} : "skip",
    { initialNumItems: 20 },
  );

  if (me === null) return <SignedOutNotice next="/team/invites" />;
  if (me && !me.synced) {
    return (
      <p role="status" className="px-6 py-10">
        We&apos;re finishing setting up your account. This usually takes a few seconds.
      </p>
    );
  }
  if (me?.synced && !allowed) {
    notFound();
  }

  const loading = !me || status === "LoadingFirstPage";
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-5 py-10 sm:px-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Workspace members</h1>
        <p className="text-muted-foreground">The teammates who manage your campaigns.</p>
      </header>
      {loading ? (
        <div role="status" className="space-y-3">
          <span className="sr-only">Loading workspace members…</span>
          {[0, 1, 2, 3].map((row) => (
            <div key={row} aria-hidden className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="rounded-xl border p-6 text-muted-foreground">No workspace members to show.</p>
      ) : (
        <ul aria-label="Workspace members" className="divide-y overflow-hidden rounded-xl border">
          {results.map((member) => {
            const name = memberName(member);
            return (
              <li key={member.membershipId} className="flex items-center gap-3 px-4 py-5 sm:px-6">
                <Image
                  src="/icons/member-avatar.svg"
                  alt=""
                  width={31}
                  height={31}
                  className="shrink-0 rounded-full bg-white"
                />
                <div className="min-w-0 flex-1">
                  <p className="break-all font-medium">{name}</p>
                  {name !== member.email && (
                    <p className="break-all text-sm text-muted-foreground">{member.email}</p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-sm font-medium sm:min-w-28 sm:text-center">
                  {member.role === "admin" ? "Admin" : "Member"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {(status === "CanLoadMore" || status === "LoadingMore") && allowed && (
        <Button
          variant="outline"
          className="min-h-11"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(20)}
        >
          {status === "LoadingMore" ? "Loading more…" : "Load more"}
        </Button>
      )}
      {me?.synced && me.role === "company" && me.companyRole === "admin" && <CompanyInvites />}
    </div>
  );
}
