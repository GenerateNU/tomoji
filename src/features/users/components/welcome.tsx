"use client";

import { SignedOutNotice } from "@/features/auth/components/signed-out-notice";
import { useMe } from "../hooks/use-me";

export function Welcome() {
  const me = useMe();

  if (me === undefined) {
    return (
      <>
        <div aria-hidden className="h-8 w-56 animate-pulse rounded-md bg-muted" />
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
    <h1 className="text-2xl font-semibold tracking-tight">
      {me.firstName ? `Welcome, ${me.firstName}` : "Welcome"}
    </h1>
  );
}
