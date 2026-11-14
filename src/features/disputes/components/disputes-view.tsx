import { RequireAccount } from "@/features/users/components/require-account";
import { CreatorDisputes } from "./creator-disputes";

/** Picks the disputes view for the signed-in user's role. Only creators have one so far. */
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
