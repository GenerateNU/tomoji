"use client";

import Link from "next/link";
import { useMe } from "@/features/users/hooks/use-me";

/** Shows company navigation only after the authoritative account has synced. */
export function TeamLink() {
  const me = useMe();
  if (!me?.synced || me.role !== "company") return null;
  return (
    <Link
      href="/team"
      className="inline-flex min-h-11 items-center rounded-md text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      Workspace members
    </Link>
  );
}
