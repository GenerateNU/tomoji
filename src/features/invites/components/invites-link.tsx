"use client";

import Link from "next/link";
import { useMe } from "@/features/users/hooks/use-me";

/** Keeps the invitation entry point hidden until the authoritative company role is available. */
export function InvitesLink() {
  const me = useMe();
  if (!me?.synced || me.role !== "company" || me.companyRole !== "admin") return null;
  return (
    <Link
      href="/team/invites"
      className="inline-flex min-h-11 items-center rounded-md text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      Team invites
    </Link>
  );
}
