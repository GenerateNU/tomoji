import { RequireAccount } from "@/features/users/components/require-account";
import { CreatorApplications } from "./creator-applications";

/** Picks the applications view for the signed-in user's role. */
export function ApplicationsView() {
  return (
    <RequireAccount
      role="creator"
      next="/applications"
      wrongRole="This page lists a creator's own applications."
    >
      <CreatorApplications />
    </RequireAccount>
  );
}
