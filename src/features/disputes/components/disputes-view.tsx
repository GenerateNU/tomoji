import { RequireAccount } from "@/features/users/components/require-account";
import { CreatorDisputes } from "./creator-disputes";

/** Creators only, for now. */
export function DisputesView() {
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
