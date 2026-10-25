import { RequireAccount } from "@/features/users/components/require-account";
import { CreatorFeed } from "./creator-feed";

/**
 * `/opportunities` serves every role (see docs/FRONTEND.md). Creators get the
 * discovery feed; the company view is a separate ticket.
 */
export function OpportunitiesPage() {
  return (
    <RequireAccount
      role="creator"
      next="/opportunities"
      wrongRole="The opportunities view for your account type isn't available yet."
    >
      <CreatorFeed />
    </RequireAccount>
  );
}
