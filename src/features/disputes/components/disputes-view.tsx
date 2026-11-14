"use client";

import { OperatorDisputes } from "@/features/operator/components/operator-disputes";
import { RequireAccount } from "@/features/users/components/require-account";
import { useMe } from "@/features/users/hooks/use-me";
import { CreatorDisputes } from "./creator-disputes";

/** Creators see their own disputes here; operators see every company's. */
export function DisputesView() {
  const me = useMe();
  if (me?.synced && me.role === "operator") return <OperatorDisputes />;
  return (
    <RequireAccount
      role="creator"
      next="/disputes"
      wrongRole="This page lists a creator's own disputes."
      loading="Loading disputes…"
    >
      <CreatorDisputes />
    </RequireAccount>
  );
}
