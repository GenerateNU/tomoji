"use client";

import Link from "next/link";
import { useMe } from "@/features/users/hooks/use-me";

/** Shows the assignments workspace link only to creators. */
export function AssignmentsLink() {
  const me = useMe();
  if (!me?.synced || me.role !== "creator") return null;
  return (
    <Link
      href="/assignments"
      className="inline-flex min-h-11 items-center rounded-md text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
    >
      Assignments
    </Link>
  );
}
