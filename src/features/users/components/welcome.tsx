"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SignedOutNotice } from "@/features/auth/components/signed-out-notice";
import { useMe } from "../hooks/use-me";

/** Shows the synced identity and each role's entry points without requesting role data. */
export function Welcome() {
  // Not RequireAccount: this is the home page and it serves every role.
  const me = useMe();

  if (me === undefined) {
    return (
      <>
        <Skeleton className="h-8 w-56" />
        <span className="sr-only" role="status">
          Loading…
        </span>
      </>
    );
  }
  if (me === null) return <SignedOutNotice next="/" />;

  if (!me.synced) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
        <p role="status" className="text-sm text-muted-foreground">
          We&apos;re finishing setting up your account. This usually takes a few seconds.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold tracking-tight">
        {me.firstName ? `Welcome, ${me.firstName}` : "Welcome"}
      </h1>
      {me.role === "creator" && (
        <nav aria-label="Get started" className="flex flex-wrap gap-3">
          <Link href="/opportunities" className={buttonVariants({ size: "lg" })}>
            Browse opportunities
          </Link>
          <Link href="/applications" className={buttonVariants({ size: "lg", variant: "outline" })}>
            My applications
          </Link>
        </nav>
      )}
      {me.role === "company" && (
        <Link
          href="/campaigns"
          className="inline-flex min-h-11 items-center rounded-md underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          View campaigns
        </Link>
      )}
    </div>
  );
}
